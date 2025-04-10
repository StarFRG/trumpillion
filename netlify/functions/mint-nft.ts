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
  // Handle CORS preflight
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
    // Safe JSON parsing
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (error) {
      monitoring.logError({
        error,
        context: { action: 'invalid_json', body: event.body }
      });
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }

    const { wallet, name, description, imageUrl, x, y } = body;

    if (!wallet || !name || !description || !imageUrl) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    const walletPublicKey = publicKey(wallet);

    // Pixel-Verfügbarkeit prüfen
    const { data: existingPixel } = await supabase
      .from('pixels')
      .select('x, y')
      .eq('x', x)
      .eq('y', y)
      .maybeSingle();

    if (existingPixel) {
      return { 
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Pixel (${x}, ${y}) ist bereits vergeben.` })
      };
    }

    // Bild validieren & laden mit Timeout
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
          body: JSON.stringify({ error: 'Bild ist zu groß (max 10MB).' })
        };
      }

      // Metadata vorbereiten
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
          creators: [{ address: base58.serialize(walletPublicKey), share: 100 }]
        }
      };

      // Metadata hochladen
      const { uri } = await umi.uploader.uploadJson(metadata);

      // Mint erzeugen
      const mint = generateSigner(umi);

      // Transaktion vorbereiten
      const transaction = createV1(umi, {
        mint,
        name,
        symbol: 'TRUMPILLION',
        uri,
        sellerFeeBasisPoints: 500,
        tokenStandard: TokenStandard.NonFungible,
        creators: [{ address: walletPublicKey, share: 100, verified: true }]
      }).toTransaction();

      // Transaktion für Client serialisieren
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false
      });

      // Sichere Extraktion der Mint-Adresse
      let mintAddress = '';
      if (mint?.publicKey && typeof mint.publicKey.toBase58 === 'function') {
        mintAddress = mint.publicKey.toBase58();
      } else {
        throw new Error('Mint publicKey is invalid or undefined');
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
    console.error('NFT minting error:', error);

    return { 
      statusCode: 500, 
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Fehler beim NFT Minting' 
      })
    };
  }
};