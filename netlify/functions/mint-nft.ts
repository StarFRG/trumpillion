import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { web3JsRpc } from '@metaplex-foundation/umi-rpc-web3js';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, signerIdentity, publicKey } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { TokenStandard, createV1 } from '@metaplex-foundation/mpl-token-metadata';
import { getErrorMessage } from '../../src/utils/errorMessages';
import { monitoring } from '../../src/services/monitoring';
import { apiFetch } from '../../src/lib/apiService';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-application-name, wallet'
};

interface MintRequest {
  wallet: string;
  name: string;
  description: string;
  imageUrl: string;
  x: number;
  y: number;
}

// Create Supabase client with service role key
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-application-name': 'trumpillion'
      }
    }
  }
);

// Retry helper function
const retry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(`⚠️ Attempt ${attempt} failed. Retrying in ${delayMs}ms...`);
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Max retries exceeded');
};

// Initialize Umi
const umi = createUmi(process.env.SOLANA_RPC_URL)
  .use(web3JsRpc({ rpcEndpoint: process.env.SOLANA_RPC_URL }))
  .use(mplTokenMetadata())
  .use(irysUploader({ timeout: 60000 }));

if (!process.env.FEE_PAYER_PRIVATE_KEY) {
  throw new Error('Missing FEE_PAYER_PRIVATE_KEY environment variable');
}

const secretKey = Uint8Array.from(JSON.parse(process.env.FEE_PAYER_PRIVATE_KEY));
const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
const signer = createSignerFromKeypair(umi, keypair);
umi.use(signerIdentity(signer));

export const handler: Handler = async (event) => {
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
    const body: MintRequest = JSON.parse(event.body);
    const { wallet, name, description, imageUrl, x, y } = body;

    // Field validation
    if (!name || !description || !imageUrl) {
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

    // Validate wallet address
    const walletPublicKey = publicKey(wallet);

    // Set headers for RLS
    const headers = {
      'wallet': wallet,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Perform atomic lock check
    const { data, error } = await supabase.rpc('lock_and_check_pixel', 
      { p_x: x, p_y: y },
      { headers }
    );

    if (error || !data) {
      monitoring.logError({
        error: error || new Error('No data returned from lock_and_check_pixel'),
        context: { action: 'lock_and_check_pixel', x, y, wallet }
      });
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('PIXEL_ALREADY_TAKEN') })
      };
    }

    // Fetch image with extended timeout
    const imageResponse = await apiFetch(imageUrl, {
      method: 'GET',
      timeout: 60000,
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
        files: [{ uri: imageUrl, type: mimeType }],
        category: 'image',
        creators: [{ address: walletPublicKey.toString(), share: 100 }]
      }
    };

    // Upload metadata with retry and logging
    const { uri } = await retry(() => umi.uploader.uploadJson(metadata));

    if (!uri) {
      throw new Error('UPLOAD_FAILED');
    }

    // Generate mint keypair
    const mint = umi.eddsa.generateKeypair();

    // Create NFT with retry and proper error handling
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

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        mint: mint.publicKey.toString()
      })
    };
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