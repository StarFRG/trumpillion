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
umi.use(signerIdentity(none()));

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export const handler: Handler = async (event): Promise<ReturnType<Handler>> => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  if (!event.body) {
    return { 
      statusCode: 400, 
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing request body' })
    };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }

    const { wallet, name, description, imageUrl, x, y } = body;

    if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing or invalid publicKey' })
      };
    }

    if (!name || !description || !imageUrl) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    if (!/^https:\/\/.*\.(jpg|jpeg|png|gif)$/i.test(imageUrl)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid image format or URL' })
      };
    }

    const walletPublicKey = publicKey(wallet);
    const walletBase58 = base58.serialize(walletPublicKey);

    // Check if pixel is available
    const { data: existingPixel, error: checkError } = await supabase
      .from('pixels')
      .select('owner')
      .eq('x', x)
      .eq('y', y)
      .maybeSingle();

    if (checkError) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to check pixel availability' })
      };
    }

    if (existingPixel?.owner) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Pixel (${x}, ${y}) is already owned` })
      };
    }

    // Validate & load image with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const imageResponse = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'image/*',
          'User-Agent': 'Trumpillion/1.0'
        }
      });

      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get('Content-Type') || 'image/jpeg';

      if (imageBuffer.byteLength > 10 * 1024 * 1024) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Image is too large (max 10MB)' })
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
          files: [{ uri: imageUrl, type: contentType }],
          category: 'image',
          creators: [{ address: walletBase58, share: 100 }]
        }
      };

      // Upload metadata
      const uploadResult = await umi.uploader.uploadJson(metadata);
      if (!uploadResult?.uri) {
        throw new Error('Failed to upload metadata (missing uri)');
      }
      const { uri } = uploadResult;

      // Create mint
      const mint = generateSigner(umi);

      // Prepare transaction
      const transaction = createV1(umi, {
        mint,
        name,
        symbol: 'TRUMPILLION',
        uri,
        sellerFeeBasisPoints: 500,
        tokenStandard: TokenStandard.NonFungible,
        creators: [{ address: walletBase58, share: 100, verified: true }]
      }).toTransaction();

      // Serialize transaction for client
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false
      });

      // Safe extraction of mint address
      const mintAddress = mint?.publicKey?.toBase58?.();
      if (!mintAddress) {
        throw new Error('Mint publicKey is missing or invalid');
      }

      // Log mint details for debugging
      console.log('Mint prepared:', { mintAddress, uri });

      return { 
        statusCode: 200, 
        headers: corsHeaders,
        body: JSON.stringify({ 
          transaction: serializedTransaction.toString('base64'),
          mint: mintAddress
        })
      };

    } finally {
      clearTimeout(timeoutId);
    }

  } catch (error) {
    console.error('NFT minting error:', error);

    return { 
      statusCode: 500, 
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Error minting NFT' 
      })
    };
  }
};