import { Handler } from '@netlify/functions';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { web3JsRpc } from '@metaplex-foundation/umi-rpc-web3js';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, signerIdentity, publicKey } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { TokenStandard, createV1 } from '@metaplex-foundation/mpl-token-metadata';
import { createClient } from '@supabase/supabase-js';
import { getErrorMessage } from '../../src/utils/errorMessages';
import { monitoring } from '../../src/services/monitoring';
import { apiFetch } from '../../src/lib/apiService';

// Create Supabase client with service role key
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Retry helper function
async function retry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt++;
    }
  }
  throw new Error('Max retries exceeded');
}

if (!process.env.SOLANA_RPC_URL?.startsWith('http')) {
  throw new Error('Missing or invalid Solana RPC URL');
}

// Initialize Umi with RPC and longer timeout
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
    } catch (parseError) {
      monitoring.logError({
        error: parseError instanceof Error ? parseError : new Error('Invalid JSON format'),
        context: { action: 'parse_request_body', body: event.body }
      });
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_INPUT') })
      };
    }

    const { wallet, name, description, imageUrl, x, y } = body;

    // Validate required fields
    if (
      !name || !description || !imageUrl ||
      typeof name !== 'string' || typeof description !== 'string' || typeof imageUrl !== 'string'
    ) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_INPUT') })
      };
    }

    // Validate URL format
    try {
      new URL(imageUrl);
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_IMAGE_URL') })
      };
    }

    if (name.length > 100 || description.length > 500) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Input too long' })
      };
    }

    // Validate wallet address
    let walletPublicKey: ReturnType<typeof publicKey> | null = null;
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

    // 1. Atomic lock and check
    try {
      const { error: lockError } = await supabase.rpc('lock_and_check_pixel', { p_x: x, p_y: y });
      if (lockError) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: getErrorMessage('PIXEL_ALREADY_TAKEN') })
        };
      }
    } catch (error) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('PIXEL_ALREADY_TAKEN') })
      };
    }

    // 2. Validate and load image
    try {
      const imageResponse = await apiFetch(imageUrl, {
        method: 'GET',
        timeout: 30000,
        headers: {
          'Accept': 'image/*',
          'User-Agent': 'Trumpillion/1.0'
        }
      });

      if (!imageResponse.ok) {
        throw new Error('UPLOAD_FAILED');
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const mimeType = imageResponse.headers.get('content-type');

      if (!['image/png', 'image/jpeg', 'image/gif'].includes(mimeType || '')) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: getErrorMessage('INVALID_IMAGE_FORMAT') })
        };
      }

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
          files: [{ uri: imageUrl, type: mimeType || 'image/jpeg' }],
          category: 'image',
          creators: [{ address: walletPublicKey.toString(), share: 100 }]
        }
      };

      // Upload metadata with retry and logging
      try {
        const { uri } = await retry(() => umi.uploader.uploadJson(metadata));
        if (!uri) {
          monitoring.logError({
            error: new Error('Metadata upload failed'),
            context: { action: 'upload_metadata', metadata }
          });
          throw new Error('UPLOAD_FAILED');
        }

        // Generate mint keypair
        const mint = umi.eddsa.generateKeypair();

        // Create NFT with retry and proper error handling
        try {
          await retry(() =>
            createV1(umi, {
              mint,
              name,
              symbol: 'TRUMPILLION',
              uri,
              sellerFeeBasisPoints: 500,
              tokenStandard: TokenStandard.NonFungible,
              creators: [{ address: walletPublicKey, share: 100, verified: false }]
            }).sendAndConfirm(umi)
          );
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

        monitoring.logInfo({
          message: 'NFT minted successfully',
          context: {
            wallet: walletPublicKey.toString(),
            mint: mint.publicKey.toString()
          }
        });

        return { 
          statusCode: 200, 
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            mint: mint.publicKey.toString()
          })
        };

      } catch (uploadError) {
        monitoring.logError({
          error: uploadError instanceof Error ? uploadError : new Error('Unknown error during metadata upload'),
          context: { action: 'upload_metadata' }
        });
        throw uploadError;
      }

    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to process image'),
        context: { action: 'process_image', imageUrl }
      });
      throw error;
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