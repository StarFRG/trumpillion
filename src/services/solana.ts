import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { monitoring } from './monitoring';
import { mintNftFromServer } from '../api/mintNft';
import { getRpcEndpoint } from '../lib/getRpcEndpoint';

const NETWORK = 'mainnet-beta';
const PROJECT_WALLET = new PublicKey('4PvW69mVK1hZpaSmfge3XUWWBhfuceaegeoiD3BTCnB6');
const PIXEL_PRICE = 1 * LAMPORTS_PER_SOL; // 1 SOL

export class SolanaService {
  private connection: Connection | null = null;
  private retryCount = 3;
  private retryDelay = 1000;

  private async initConnection() {
    if (this.connection) return;

    try {
      const endpoint = await getRpcEndpoint();
      this.connection = new Connection(endpoint, {
        commitment: 'confirmed',
        wsEndpoint: endpoint.replace('https', 'wss'),
        confirmTransactionInitialTimeout: 60000
      });
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Connection initialization failed'),
        context: { action: 'init_connection' }
      });
      throw error;
    }
  }

  private async getConnection(): Promise<Connection> {
    if (!this.connection) {
      await this.initConnection();
    }
    if (!this.connection) {
      throw new Error('Verbindung konnte nicht initialisiert werden');
    }
    return this.connection;
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
    if (!wallet?.publicKey) {
      throw new Error('Wallet ist nicht verbunden');
    }

    return await this.retry(async () => {
      try {
        const connection = await this.getConnection();

        if (!wallet?.publicKey) {
          throw new Error('Wallet ist nicht verbunden');
        }

        const balance = await connection.getBalance(wallet.publicKey);
        
        if (balance < PIXEL_PRICE + 5000) { // 5000 lamports for transaction fee
          throw new Error('Unzureichendes Guthaben. Du brauchst mindestens 1 SOL um ein Pixel zu kaufen.');
        }

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        if (!wallet?.publicKey) {
          throw new Error('Wallet ist nicht verbunden');
        }

        const transaction = new Transaction({
          feePayer: wallet.publicKey,
          recentBlockhash: blockhash
        }).add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: PROJECT_WALLET,
            lamports: PIXEL_PRICE
          })
        );

        const signedTx = await wallet.signTransaction(transaction);
        const txId = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3
        });

        const confirmation = await connection.confirmTransaction({
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
    if (!wallet?.publicKey) {
      throw new Error('Wallet ist nicht verbunden');
    }

    try {
      const response = await fetch('/.netlify/functions/mint-nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          wallet: wallet?.publicKey?.toString?.() ?? '',
          name,
          description,
          imageUrl,
          x: x || 0,
          y: y || 0
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to get mint transaction' }));
        throw new Error(error.error || 'Failed to get mint transaction');
      }

      const { transaction: serializedTx, mint } = await response.json();
      
      const connection = await this.getConnection();
      const transaction = Transaction.from(Buffer.from(serializedTx, 'base64'));
      
      const signature = await wallet.sendTransaction(transaction, connection);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      });

      if (confirmation.value.err) {
        throw new Error('NFT minting failed');
      }

      return mint;
    } catch (error) {
      console.error('NFT Minting fehlgeschlagen:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('NFT Minting fehlgeschlagen'),
        context: { 
          action: 'mint_nft',
          wallet: wallet?.publicKey?.toString?.() ?? '',
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
        const connection = await this.getConnection();
        const balance = await connection.getBalance(publicKey);
        return balance / LAMPORTS_PER_SOL;
      } catch (error) {
        console.error('Wallet Balance Abfrage fehlgeschlagen:', error);
        throw new Error('Wallet Balance Abfrage fehlgeschlagen');
      }
    });
  }
}

export const solanaService = new SolanaService();