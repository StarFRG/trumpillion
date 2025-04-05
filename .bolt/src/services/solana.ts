import { Metaplex, bundlrStorage, keypairIdentity } from '@metaplex-foundation/js';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { debounce } from 'lodash';
import { nftService } from './nft';

const NETWORK = 'mainnet-beta';
const ENDPOINT = `https://api.${NETWORK}.solana.com`;
const PROJECT_WALLET = new PublicKey('4PvW69mVK1hZpaSmfge3XUWWBhfuceaegeoiD3BTCnB6');
const PIXEL_PRICE = 1 * LAMPORTS_PER_SOL; // 1 SOL

interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
}

export class SolanaService {
  private connection: Connection;
  private metaplex: Metaplex;
  private retryCount = 3;
  private retryDelay = 1000;

  constructor() {
    this.connection = new Connection(ENDPOINT, {
      commitment: 'confirmed',
      wsEndpoint: `wss://api.${NETWORK}.solana.com`,
    });
    this.metaplex = new Metaplex(this.connection);
  }

  private async retry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.retryCount) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }
    
    throw lastError;
  }

  async processPayment(wallet: WalletContextState): Promise<string> {
    if (!wallet.publicKey) {
      throw new Error('Wallet nicht verbunden');
    }

    const balance = await this.connection.getBalance(wallet.publicKey);
    if (balance < PIXEL_PRICE + 5000) {
      throw new Error('Unzureichendes Guthaben. Du brauchst mindestens 1 SOL um ein Pixel zu kaufen.');
    }

    return await this.retry(async () => {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey!,
          toPubkey: PROJECT_WALLET,
          lamports: PIXEL_PRICE
        })
      );

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      const signedTx = await wallet.signTransaction(transaction);
      const txId = await this.connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      const confirmation = await this.connection.confirmTransaction({
        signature: txId,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error('Transaktion fehlgeschlagen');
      }

      return txId;
    });
  }

  async mintNFT(
    wallet: WalletContextState,
    name: string,
    description: string,
    imageUrl: string,
    x?: number,
    y?: number
  ): Promise<string> {
    if (!wallet.publicKey) {
      throw new Error('Wallet nicht verbunden');
    }

    try {
      const nft = await nftService.mintNFT(
        wallet.publicKey,
        name,
        description,
        imageUrl,
        x || 0,
        y || 0
      );

      return nft.address.toString();
    } catch (error) {
      console.error('NFT Minting fehlgeschlagen:', error);
      throw new Error('NFT konnte nicht erstellt werden');
    }
  }

  async getWalletBalance(publicKey: PublicKey): Promise<number> {
    return await this.retry(async () => {
      try {
        const balance = await this.connection.getBalance(publicKey);
        return balance / LAMPORTS_PER_SOL;
      } catch (error) {
        console.error('Wallet Balance Abfrage fehlgeschlagen:', error);
        throw new Error('Wallet Balance Abfrage fehlgeschlagen');
      }
    });
  }
}

export const solanaService = new SolanaService();