import { Handler } from '@netlify/functions';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import { Keypair as Web3Keypair } from '@solana/web3.js';
import { TokenStandard, createV1 } from '@metaplex-foundation/mpl-token-metadata';
import { supabase } from './supabase-client';
import { getErrorMessage } from '../../src/utils/errorMessages';
import { monitoring } from '../../src/services/monitoring';

const rpcUrl = process.env.SOLANA_RPC_URL;
if (!rpcUrl?.startsWith('http')) {
  throw new Error('Missing or invalid Solana RPC URL');
}

// Initialize Umi with fee payer
const umi = createUmi(rpcUrl).use(irysUploader());

// Set up fee payer from environment variable
if (!process.env.FEE_PAYER_PRIVATE_KEY) {
  throw new Error('Missing FEE_PAYER_PRIVATE_KEY environment variable');
}

try {
  const secretKey = JSON.parse(process.env.FEE_PAYER_PRIVATE_KEY!);

  console.log('[DEBUG] FEE_PAYER_PRIVATE_KEY Länge:', secretKey.length);

  const web3Keypair = Web3Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const feePayer = fromWeb3JsKeypair(umi, web3Keypair);
  umi.use(signerIdentity(feePayer));
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

    // Validate image URL format
    if (!/^https?:\/\/.*\.(jpg|jpeg|png|gif)$/i.test(imageUrl)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_IMAGE') })
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
        throw new Error('UPLOAD_FAILED');
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get('Content-Type') || 'image/jpeg';

      if (imageBuffer.byteLength > 10 * 1024 * 1024) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: getErrorMessage('INVALID_IMAGE') })
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
          creators: [{ address: walletPublicKey.toString(), share: 100 }]
        }
      };

      // Upload metadata
      const uploadResult = await umi.uploader.uploadJson(metadata);
      if (!uploadResult?.uri) {
        throw new Error('UPLOAD_FAILED');
      }
      const { uri } = uploadResult;

      // Generate mint
      const mint = generateSigner(umi);

      // Prepare transaction
      const transaction = createV1(umi, {
        mint,
        name,
        symbol: 'TRUMPILLION',
        uri,
        sellerFeeBasisPoints: 500,
        tokenStandard: TokenStandard.NonFungible,
        creators: [{ address: walletPublicKey.toString(), share: 100, verified: true }]
      }).toTransaction();

      // Serialize transaction for client
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false
      });

      // Extract mint address safely
      const mintAddress = mint?.publicKey?.toString();
      if (!mintAddress) {
        throw new Error('MINT_FAILED');
      }

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