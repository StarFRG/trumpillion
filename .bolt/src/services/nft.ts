import { Metaplex, bundlrStorage, keypairIdentity, CreateNftInput } from '@metaplex-foundation/js';
import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { monitoring } from './monitoring';

// Collection Constants
const COLLECTION_NAME = 'Trumpillion Pixels';
const COLLECTION_SYMBOL = 'TRUMPILLION';
const COLLECTION_DESCRIPTION = 'Be a Part of History - A million pixel NFTs creating Trump\'s portrait';
const COLLECTION_AUTHORITY = new PublicKey('4PvW69mVK1hZpaSmfge3XUWWBhfuceaegeoiD3BTCnB6');
const COLLECTION_ADDRESS = new PublicKey('TRUMPpixeLs1111111111111111111111111111111');

export class NFTService {
  private connection: Connection;
  private metaplex: Metaplex;

  constructor() {
    this.connection = new Connection(clusterApiUrl('mainnet-beta'));
    this.metaplex = Metaplex.make(this.connection)
      .use(bundlrStorage());
  }

  private async uploadMetadata(metadata: any) {
    try {
      const { uri } = await this.metaplex
        .nfts()
        .uploadMetadata(metadata);
      return uri;
    } catch (error) {
      console.error('Failed to upload metadata:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to upload metadata'),
        context: { action: 'upload_metadata', metadata }
      });
      throw error;
    }
  }

  async mintNFT(
    wallet: PublicKey,
    name: string,
    description: string,
    image: string,
    x: number,
    y: number
  ) {
    try {
      // Prepare NFT metadata
      const metadata = {
        name,
        symbol: COLLECTION_SYMBOL,
        description,
        image,
        attributes: [
          {
            trait_type: 'X Coordinate',
            value: x.toString()
          },
          {
            trait_type: 'Y Coordinate',
            value: y.toString()
          },
          {
            trait_type: 'Position',
            value: `${x},${y}`
          },
          {
            trait_type: 'Collection',
            value: COLLECTION_NAME
          },
          {
            trait_type: 'Creation Date',
            value: new Date().toISOString()
          }
        ],
        properties: {
          files: [
            {
              uri: image,
              type: 'image/jpeg'
            }
          ],
          category: 'image',
          creators: [
            {
              address: wallet.toString(),
              share: 95
            },
            {
              address: COLLECTION_AUTHORITY.toString(),
              share: 5
            }
          ]
        }
      };

      // Upload metadata
      const uri = await this.uploadMetadata(metadata);

      // Mint NFT with collection
      const { nft } = await this.metaplex
        .nfts()
        .create({
          uri,
          name,
          sellerFeeBasisPoints: 500, // 5% royalties
          symbol: COLLECTION_SYMBOL,
          creators: [
            {
              address: wallet,
              share: 95,
              verified: true
            },
            {
              address: COLLECTION_AUTHORITY,
              share: 5,
              verified: true
            }
          ],
          collection: {
            address: COLLECTION_ADDRESS,
            verified: false
          },
          uses: null
        });

      // Verify the NFT belongs to the collection
      await this.metaplex
        .nfts()
        .verifyCollection({
          mintAddress: nft.address,
          collectionMintAddress: COLLECTION_ADDRESS,
          collectionAuthority: COLLECTION_AUTHORITY,
        });

      return nft;
    } catch (error) {
      console.error('Failed to mint NFT:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to mint NFT'),
        context: { 
          action: 'mint_nft',
          wallet: wallet.toString(),
          name,
          x,
          y
        }
      });
      throw error;
    }
  }
}

export const nftService = new NFTService();