import { Handler } from '@netlify/functions';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } from '@metaplex-foundation/umi';
import { TokenStandard, createV1 } from '@metaplex-foundation/mpl-token-metadata';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { supabase } from './supabase-client';

const rpcUrl = process.env.SOLANA_RPC_URL;
if (!rpcUrl) {
  throw new Error('Missing Solana RPC URL');
}

const umi = createUmi(rpcUrl).use(irysUploader());

export const handler: Handler = async (event) => {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
  }

  try {
    const { wallet, name, description, imageUrl, x, y } = JSON.parse(event.body);

    if (!wallet || !name || !description || !imageUrl) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Missing required fields' }) 
      };
    }

    const walletPublicKey = publicKey(wallet);

    // Verify pixel availability
    const { data: existingPixel } = await supabase
      .from('pixels')
      .select('x, y')
      .eq('x', x)
      .eq('y', y)
      .maybeSingle();

    if (existingPixel) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: `Pixel (${x}, ${y}) ist bereits vergeben.` }) 
      };
    }

    // Setup Umi with wallet
    umi.use(signerIdentity(createSignerFromKeypair(umi, {
      publicKey: walletPublicKey,
      secretKey: new Uint8Array(64) // Dummy - wird von der realen Wallet ersetzt
    })));

    // Validate image
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();

    if (imageBuffer.byteLength > 10 * 1024 * 1024) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Bild ist zu groß (max 10MB).' }) 
      };
    }

    // Prepare metadata
    const metadata = {
      name,
      symbol: 'TRUMPILLION',
      description,
      image: imageUrl,
      attributes: [
        { trait_type: 'X Coordinate', value: x.toString() },
        { trait_type: 'Y Coordinate', value: y.toString() }
      ],
      properties: {
        files: [{ uri: imageUrl, type: 'image/jpeg' }],
        category: 'image',
        creators: [{ address: base58.serialize(walletPublicKey), share: 100 }]
      }
    };

    // Upload metadata
    const { uri } = await umi.uploader.uploadJson(metadata);

    // Generate mint
    const mint = generateSigner(umi);

    // Create NFT
    await createV1(umi, {
      mint,
      name,
      symbol: 'TRUMPILLION',
      uri,
      sellerFeeBasisPoints: 500,
      tokenStandard: TokenStandard.NonFungible,
      creators: [{ address: walletPublicKey, share: 100, verified: true }]
    }).sendAndConfirm(umi);

    return { 
      statusCode: 200, 
      body: JSON.stringify({ 
        success: true, 
        mint: mint.publicKey.toString() 
      }) 
    };

  } catch (error: any) {
    console.error('NFT minting error:', error);

    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: error.message || 'Fehler beim NFT Minting' 
      }) 
    };
  }
};