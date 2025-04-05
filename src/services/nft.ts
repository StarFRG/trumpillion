import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNft, TokenStandard, createV1, verifyCollectionV1 } from '@metaplex-foundation/mpl-token-metadata';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { monitoring } from './monitoring';
import { supabase } from '../lib/supabase';

const DEFAULT_RPC_URL = 'https://powerful-small-needle.solana-mainnet.quiknode.pro/025d650e2597bb80e708ac95bdf4a004dd00ba02/';
const MAX_IMAGE_SIZE_MB = 10;
const TX_CONFIRMATION_TIMEOUT_MS = 30000;

export class NFTService {
  private umi;
  private retryCount = 3;
  private retryDelay = 1000;

  constructor() {
    this.umi = createUmi(DEFAULT_RPC_URL).use(irysUploader());
  }

  async mintNFT(
    wallet: string,
    name: string,
    description: string,
    imageUrl: string,
    x: number,
    y: number
  ) {
    const walletPublicKey = publicKey(wallet);

    // Validierung der Koordinaten in der Datenbank
    const { data: existingPixel } = await supabase
      .from('pixels')
      .select('x, y')
      .eq('x', x)
      .eq('y', y)
      .maybeSingle();

    if (existingPixel) {
      throw new Error(`Pixel (${x}, ${y}) wurde bereits vergeben.`);
    }

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        // Wallet Signer setzen
        this.umi.use(signerIdentity(createSignerFromKeypair(this.umi, {
          publicKey: walletPublicKey,
          secretKey: new Uint8Array(64) // Dummy – wird von realer Wallet ersetzt
        })));

        // Bild validieren & laden
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();

        if (imageBuffer.byteLength > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
          throw new Error(`Bild überschreitet ${MAX_IMAGE_SIZE_MB}MB Limit.`);
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
            files: [{ uri: imageUrl, type: 'image/jpeg' }],
            category: 'image',
            creators: [{ address: base58.serialize(walletPublicKey), share: 100 }]
          }
        };

        // Metadata hochladen
        const { uri } = await this.umi.uploader.uploadJson(metadata);

        // Mint erzeugen
        const mint = generateSigner(this.umi);

        // NFT erstellen & bestätigen mit Timeout
        const txPromise = createV1(this.umi, {
          mint,
          name,
          symbol: 'TRUMPILLION',
          uri,
          sellerFeeBasisPoints: 500,
          tokenStandard: TokenStandard.NonFungible,
          creators: [{ address: walletPublicKey, share: 100, verified: true }]
        }).sendAndConfirm(this.umi);

        const txResult = await this.withTimeout(txPromise, TX_CONFIRMATION_TIMEOUT_MS);
        return mint.publicKey;
      } catch (error) {
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Unbekannter Fehler'),
          context: { wallet, name, x, y, attempt }
        });

        // Nur beim letzten Versuch: Cleanup
        if (attempt === this.retryCount) {
          const fileName = imageUrl.split('/').pop();
          if (fileName) {
            await supabase.storage.from('nft-images').remove([fileName]);
          }

          throw new Error(`NFT Mint fehlgeschlagen nach ${this.retryCount} Versuchen.`);
        }

        // Kurze Wartezeit vor erneutem Versuch
        await this.delay(this.retryDelay * attempt);
      }
    }
  }

  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Transaktions-Timeout: Keine Bestätigung erhalten.'));
      }, timeout);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

export const nftService = new NFTService();