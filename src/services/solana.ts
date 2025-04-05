import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { monitoring } from './monitoring';
import { mintNftFromServer } from '../api/mintNft';

const NETWORK = 'mainnet-beta';
const PROJECT_WALLET = new PublicKey('4PvW69mVK1hZpaSmfge3XUWWBhfuceaegeoiD3BTCnB6');
const PIXEL_PRICE = 1 * LAMPORTS_PER_SOL; // 1 SOL

export class SolanaService {
  private connection: Connection;
  private retryCount = 3;
  private retryDelay = 1000;

  constructor() {
    // In Development: Use local RPC URL
    // In Production: Use Netlify Function for RPC operations
    const endpoint = import.meta.env.DEV 
      ? import.meta.env.VITE_SOLANA_RPC_URL 
      : 'https://api.mainnet-beta.solana.com'; // Fallback for balance checks only

    this.connection = new Connection(endpoint, {
      commitment: 'confirmed',
      wsEndpoint: endpoint.replace('https://', 'wss://'),
      confirmTransactionInitialTimeout: 60000
    });
  }

  private async retry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt} failed:`, error);
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

    return await this.retry(async () => {
      try {
        const balance = await this.connection.getBalance(wallet.publicKey!);
        if (balance < PIXEL_PRICE + 5000) { // 5000 lamports for transaction fee
          throw new Error('Unzureichendes Guthaben. Du brauchst mindestens 1 SOL um ein Pixel zu kaufen.');
        }

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
          maxRetries: 3
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
      } catch (error) {
        console.error('Payment failed:', error);
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Payment failed'),
          context: { action: 'process_payment' }
        });
        throw new Error('Transaktion fehlgeschlagen. Bitte versuche es erneut.');
      }
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
      return await mintNftFromServer({
        wallet: wallet.publicKey.toString(),
        name,
        description,
        imageUrl,
        x: x || 0,
        y: y || 0
      });
    } catch (error) {
      console.error('NFT Minting fehlgeschlagen:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('NFT Minting fehlgeschlagen'),
        context: { 
          action: 'mint_nft',
          wallet: wallet.publicKey.toString(),
          name,
          x,
          y
        }
      });
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