import { Handler } from '@netlify/functions';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { web3JsRpc } from '@metaplex-foundation/umi-rpc-web3js';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, signerIdentity, publicKey } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { TokenStandard, createV1 } from '@metaplex-foundation/mpl-token-metadata';
import { supabase } from './supabase-client';
import { getErrorMessage } from '../../src/utils/errorMessages';
import { monitoring } from '../../src/services/monitoring';

if (!process.env.SOLANA_RPC_URL?.startsWith('http')) {
  throw new Error('Missing or invalid Solana RPC URL');
}

// Initialize Umi with RPC
const umi = createUmi(process.env.SOLANA_RPC_URL)
  .use(web3JsRpc({ rpcEndpoint: process.env.SOLANA_RPC_URL }))
  .use(mplTokenMetadata())
  .use(irysUploader({ timeout: 30000 }));

// Set up fee payer from environment variable
if (!process.env.FEE_PAYER_PRIVATE_KEY) {
  throw new Error('Missing FEE_PAYER_PRIVATE_KEY environment variable');
}

try {
  const secretKey = Uint8Array.from(JSON.parse(process.env.FEE_PAYER_PRIVATE_KEY));
  const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, keypair);
  umi.use(signerIdentity(signer));
} catch (error) {
  monitoring.logError({
    error: error instanceof Error ? error : new Error('Failed to initialize fee payer'),
    context: { action: 'init_fee_payer' }
  });
  throw new Error('Failed to initialize fee payer');
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

interface MintRequest {
  wallet: string;
  name: string;
  description: string;
  imageUrl: string;
  x: number;
  y: number;
}

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
      body: JSON.stringify({ error: getErrorMessage('INVALID_INPUT') })
    };
  }

  try {
    let body: MintRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_INPUT') })
      };
    }

    const { wallet, name, description, imageUrl, x, y } = body;

    // Validate wallet address
    let walletPublicKey;
    try {
      walletPublicKey = publicKey(wallet);
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Invalid wallet address'),
        context: { action: 'validate_wallet', wallet }
      });
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_WALLET_ADDRESS') })
      };
    }

    // Validate required fields
    if (!name || !description || !imageUrl) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_INPUT') })
      };
    }

    // Check pixel availability
    const { data: existingPixel } = await supabase
      .from('pixels')
      .select('x, y', { head: false })
      .eq('x', x)
      .eq('y', y)
      .maybeSingle();

    if (existingPixel) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('PIXEL_ALREADY_TAKEN') })
      };
    }

    // Validate and load image with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const imageResponse = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'image/*',
          'User-Agent': 'Trumpillion/1.0'
        }
      });

      if (!imageResponse.ok) {
        throw new Error('UPLOAD_FAILED');
      }

      const imageBuffer = await imageResponse.arrayBuffer();

      // Magic byte validation
      const header = new Uint8Array(imageBuffer.slice(0, 4));
      const isPNG = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
      const isJPEG = header[0] === 0xFF && header[1] === 0xD8;
      const isGIF = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;

      if (!isPNG && !isJPEG && !isGIF) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: getErrorMessage('INVALID_IMAGE_BYTES') })
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
          files: [{ uri: imageUrl, type: imageResponse.headers.get('content-type') || 'image/jpeg' }],
          category: 'image',
          creators: [{ address: walletPublicKey.toString(), share: 100 }]
        }
      };

      // Upload metadata with timeout
      const { uri } = await umi.uploader.uploadJson(metadata);
      if (!uri) {
        throw new Error('UPLOAD_FAILED');
      }

      // Generate mint keypair
      const mint = umi.eddsa.generateKeypair();

      // Create NFT with proper error handling
      try {
        await createV1(umi, {
          mint,
          name,
          symbol: 'TRUMPILLION',
          uri,
          sellerFeeBasisPoints: 500,
          tokenStandard: TokenStandard.NonFungible,
          creators: [{ address: walletPublicKey, share: 100, verified: false }]
        }).sendAndConfirm(umi);
      } catch (mintError) {
        monitoring.logError({
          error: mintError instanceof Error ? mintError : new Error('NFT mint failed'),
          context: { 
            action: 'mint_nft',
            wallet: walletPublicKey.toString(),
            uri
          }
        });
        throw new Error('NFT_MINT_FAILED: ' + (mintError instanceof Error ? mintError.message : 'Unknown error'));
      }

      return { 
        statusCode: 200, 
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          mint: mint.publicKey.toString()
        })
      };

    } finally {
      clearTimeout(timeoutId);
    }

  } catch (error) {
    const errorMessage = getErrorMessage(error);

    monitoring.logErrorWithContext(error, 'mint-nft.ts', {
      errorMessage,
      body: event.body ?? null
    });

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: errorMessage
      })
    };
  }
};