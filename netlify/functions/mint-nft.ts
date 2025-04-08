import { Handler } from '@netlify/functions';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { createSignerFromKeypair, signerIdentity, generateSigner, publicKey, none } from '@metaplex-foundation/umi';
import { TokenStandard, createV1 } from '@metaplex-foundation/mpl-token-metadata';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { supabase } from './supabase-client';

const rpcUrl = process.env.SOLANA_RPC_URL;
if (!rpcUrl?.startsWith('http')) {
  throw new Error('Missing or invalid Solana RPC URL');
}

const umi = createUmi(rpcUrl).use(irysUploader());
// Explicitly set null signer to indicate client-side signing
umi.use(signerIdentity(none()));

export const handler: Handler = async (event) => {
  if (!event.body) {
    return { 
      statusCode: 400, 
      body: JSON.stringify({ error: 'Missing request body' }),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
  }

  try {
    const { wallet, name, description, imageUrl, x, y } = JSON.parse(event.body);

    if (!wallet || !name || !description || !imageUrl) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Missing required fields' }),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
    }

    const walletPublicKey = publicKey(wallet);

    // Verify pixel availability with proper headers
    const { data: existingPixel } = await supabase
      .from('pixels')
      .select('x, y', { 
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })
      .eq('x', x)
      .eq('y', y)
      .maybeSingle();

    if (existingPixel) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: `Pixel (${x}, ${y}) ist bereits vergeben.` }),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
    }

    // Validate image with proper headers
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'Accept': 'image/*',
        'User-Agent': 'Trumpillion/1.0'
      }
    });

    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();

    if (imageBuffer.byteLength > 10 * 1024 * 1024) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Bild ist zu groß (max 10MB).' }),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
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

    // Create unsigned transaction
    const transaction = createV1(umi, {
      mint,
      name,
      symbol: 'TRUMPILLION',
      uri,
      sellerFeeBasisPoints: 500,
      tokenStandard: TokenStandard.NonFungible,
      creators: [{ address: walletPublicKey, share: 100, verified: true }]
    }).toTransaction();

    // Serialize transaction for client
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false
    }).toString('base64');

    return { 
      statusCode: 200, 
      body: JSON.stringify({ 
        transaction: serializedTransaction,
        mint: mint.publicKey.toString()
      }),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

  } catch (error: any) {
    console.error('NFT minting error:', error);

    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: error.message || 'Fehler beim NFT Minting' 
      }),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
  }
};