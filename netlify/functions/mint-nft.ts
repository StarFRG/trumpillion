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

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-application-name, Wallet'
};

interface MintRequest {
  wallet: string;
  name: string;
  description: string;
  imageUrl: string;
  x: number;
  y: number;
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

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

    if (!name || !description || !imageUrl) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_INPUT') })
      };
    }

    try {
      new URL(imageUrl);
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_IMAGE_URL') })
      };
    }

    const walletPublicKey = publicKey(wallet);

    // Validate wallet header
    const walletHeader = event.headers['Wallet'];
    if (!walletHeader || walletHeader !== wallet) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: getErrorMessage('INVALID_WALLET_HEADER') })
      };
    }

    // Perform atomic lock check with wallet header
    const { data, error } = await supabase.rpc('lock_and_check_pixel', 
      { p_x: x, p_y: y },
      { 
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Wallet': wallet
        }
      }
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
        creators: [{ address: walletPublicKey.toString(), share: 100 }]
      }
    };

    const { uri } = await umi.uploader.uploadJson(metadata);

    if (!uri) {
      throw new Error('UPLOAD_FAILED');
    }

    const mint = umi.eddsa.generateKeypair();

    await createV1(umi, {
      mint,
      name,
      symbol: 'TRUMPILLION',
      uri,
      sellerFeeBasisPoints: 500,
      tokenStandard: TokenStandard.NonFungible,
      creators: [{ address: walletPublicKey, share: 100, verified: false }]
    }).sendAndConfirm(umi);

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