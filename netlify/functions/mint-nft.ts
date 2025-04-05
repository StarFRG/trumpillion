import { Handler } from '@netlify/functions'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } from '@metaplex-foundation/umi'
import { TokenStandard, createV1 } from '@metaplex-foundation/mpl-token-metadata'
import { base58 } from '@metaplex-foundation/umi/serializers'
import { createClient } from '@supabase/supabase-js'

const rpcUrl = process.env.VITE_SOLANA_RPC_URL as string
const supabaseUrl = process.env.VITE_SUPABASE_URL as string
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY as string

const supabase = createClient(supabaseUrl, supabaseKey)
const umi = createUmi(rpcUrl).use(irysUploader())

export const handler: Handler = async (event) => {
  try {
    const { wallet, name, description, imageUrl, x, y } = JSON.parse(event.body || '{}')
    const walletPublicKey = publicKey(wallet)

    const { data: existingPixel } = await supabase
      .from('pixels')
      .select('x, y')
      .eq('x', x)
      .eq('y', y)
      .maybeSingle()

    if (existingPixel) {
      return { statusCode: 400, body: JSON.stringify({ error: `Pixel (${x}, ${y}) vergeben.` }) }
    }

    umi.use(signerIdentity(createSignerFromKeypair(umi, {
      publicKey: walletPublicKey,
      secretKey: new Uint8Array(64) // Platzhalter
    })))

    const imageResponse = await fetch(imageUrl)
    const imageBuffer = await imageResponse.arrayBuffer()

    if (imageBuffer.byteLength > 10 * 1024 * 1024) {
      return { statusCode: 400, body: 'Bild zu groß.' }
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
        creators: [{ address: base58.serialize(walletPublicKey), share: 100 }]
      }
    }

    const { uri } = await umi.uploader.uploadJson(metadata)
    const mint = generateSigner(umi)

    await createV1(umi, {
      mint,
      name,
      symbol: 'TRUMPILLION',
      uri,
      sellerFeeBasisPoints: 500,
      tokenStandard: TokenStandard.NonFungible,
      creators: [{ address: walletPublicKey, share: 100, verified: true }]
    }).sendAndConfirm(umi)

    return { statusCode: 200, body: JSON.stringify({ success: true, mint: mint.publicKey.toString() }) }

  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Fehler beim Mint' }) }
  }
}