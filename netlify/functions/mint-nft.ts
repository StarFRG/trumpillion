import { Handler } from '@netlify/functions';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { signerIdentity, generateSigner, publicKey, none } from '@metaplex-foundation/umi';
import { TokenStandard, createV1 } from '@metaplex-foundation/mpl-token-metadata';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { supabase } from './supabase-client';
import { getErrorMessage } from '../../src/utils/errorMessages';
import { monitoring } from '../../src/services/monitoring';

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

    if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('WALLET_NOT_CONNECTED') })
      };
    }

    if (!name || !description || !imageUrl) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_INPUT') })
      };
    }

    const walletPublicKey = publicKey(wallet);
    const walletBase58 = base58.serialize(walletPublicKey);

    // Check pixel availability
    const { data: existingPixel } = await supabase
      .from('pixels')
      .select('x, y')
      .eq('x', x)
      .eq('y', y)
      .maybeSingle();

    if (existingPixel?.owner) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('PIXEL_ALREADY_TAKEN') })
      };
    }

    // Generate mint keypair in backend
    const mint = generateSigner(umi);

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
        creators: [{ address: walletBase58, share: 100 }]
      }
    };

    // Upload metadata
    const uploadResult = await umi.uploader.uploadJson(metadata);
    if (!uploadResult?.uri) {
      throw new Error('UPLOAD_FAILED');
    }
    const { uri } = uploadResult;

    // Prepare transaction
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
    });

    // Extract mint address
    const mintAddress = mint.publicKey.toBase58();

    return { 
      statusCode: 200, 
      headers: corsHeaders,
      body: JSON.stringify({ 
        transaction: serializedTransaction.toString('base64'),
        mint: mintAddress
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
