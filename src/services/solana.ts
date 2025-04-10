import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionSignature } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { monitoring } from './monitoring';
import { mintNftFromServer } from '../api/mintNft';
import { getRpcEndpoint } from '../lib/getRpcEndpoint';
import { isWalletConnected, getWalletPublicKey, getWalletAddress } from '../utils/walletUtils';

const NETWORK = 'mainnet-beta';
const PROJECT_WALLET = new PublicKey('4PvW69mVK1hZpaSmfge3XUWWBhfuceaegeoiD3BTCnB6');
const PIXEL_PRICE = 1 * LAMPORTS_PER_SOL; // 1 SOL

enum TransactionErrorType {
  INVALID_BLOCK = 'INVALID_BLOCK',
  CONFIRMATION_ERROR = 'CONFIRMATION_ERROR',
  TRANSACTION_ERROR = 'TRANSACTION_ERROR'
}

interface TransactionError extends Error {
  type?: TransactionErrorType;
  details?: any;
}

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

  private validateBlockDetails(blockhash: string | null, lastValidBlockHeight: number | null): void {
    if (!blockhash || !lastValidBlockHeight) {
      const error = new Error('Invalid block details retrieved') as TransactionError;
      error.type = TransactionErrorType.INVALID_BLOCK;
      error.details = { blockhash, lastValidBlockHeight };
      monitoring.logError({
        error,
        context: { 
          action: 'validate_block_details',
          details: error.details
        }
      });
      throw error;
    }
  }

  private async retry<T>(operation: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt} failed:`, error);
        
        if (attempt === this.retryCount) {
          monitoring.logError({
            error: lastError,
            context: {
              action: 'final_retry_failed',
              lastAttempt: this.retryCount,
              operationContext: context,
              errorMessage: lastError.message
            }
          });
        }
        
        if (attempt < this.retryCount) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }
    
    throw lastError;
  }

  async processPayment(wallet: WalletContextState): Promise<string> {
    if (!isWalletConnected(wallet)) {
      throw new Error('Wallet ist nicht verbunden');
    }

    const pubkey = getWalletPublicKey(wallet);
    if (!pubkey) throw new Error('Wallet nicht verbunden');

    return await this.retry(async () => {
      try {
        const connection = await this.getConnection();
        const balance = await connection.getBalance(pubkey);
        
        if (balance < PIXEL_PRICE + 5000) { // 5000 lamports for transaction fee
          throw new Error('Unzureichendes Guthaben. Du brauchst mindestens 1 SOL um ein Pixel zu kaufen.');
        }

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        this.validateBlockDetails(blockhash, lastValidBlockHeight);

        const transaction = new Transaction({
          feePayer: pubkey,
          recentBlockhash: blockhash
        }).add(
          SystemProgram.transfer({
            fromPubkey: pubkey,
            toPubkey: PROJECT_WALLET,
            lamports: PIXEL_PRICE
          })
        );

        const signedTx = await wallet.signTransaction(transaction);
        if (!signedTx) {
          const error = new Error('Transaktion konnte nicht signiert werden') as TransactionError;
          error.type = TransactionErrorType.TRANSACTION_ERROR;
          throw error;
        }

        const txId = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3
        });

        if (!txId || typeof txId !== 'string') {
          const error = new Error('Transaktion konnte nicht gesendet werden') as TransactionError;
          error.type = TransactionErrorType.TRANSACTION_ERROR;
          throw error;
        }

        const confirmation = await connection.confirmTransaction({
          signature: txId,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight
        }, 'confirmed');

        if (confirmation.value.err) {
          const error = new Error('Transaktion fehlgeschlagen') as TransactionError;
          error.type = TransactionErrorType.CONFIRMATION_ERROR;
          error.details = confirmation.value.err;
          throw error;
        }

        return txId;
      } catch (error) {
        console.error('Payment failed:', error);
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Payment failed'),
          context: { 
            action: 'process_payment',
            wallet: getWalletAddress(wallet),
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
        throw new Error('Transaktion fehlgeschlagen. Bitte versuche es erneut.');
      }
    }, 'process_payment');
  }

  async mintNFT(
    wallet: WalletContextState,
    name: string,
    description: string,
    imageUrl: string,
    x?: number,
    y?: number
  ): Promise<string> {
    if (!isWalletConnected(wallet)) {
      throw new Error('Wallet ist nicht verbunden');
    }

    const pubkey = getWalletPublicKey(wallet);
    if (!pubkey) throw new Error('Wallet nicht verbunden');

    try {
      const response = await fetch('/.netlify/functions/mint-nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          wallet: getWalletAddress(wallet),
          name,
          description,
          imageUrl,
          x: x || 0,
          y: y || 0
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to get mint transaction' }));
        throw new Error(`Server error: ${error.error || 'Failed to generate transaction'}`);
      }

      const { transaction: serializedTx, mint } = await response.json();

      if (!serializedTx || typeof serializedTx !== 'string') {
        throw new Error('Ungültige Transaktion erhalten');
      }

      if (!mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
        throw new Error('Invalid mint address received');
      }
      
      const connection = await this.getConnection();
      const transaction = Transaction.from(Buffer.from(serializedTx, 'base64'));
      
      const signature = await wallet.sendTransaction(transaction, connection);
      
      if (!signature || typeof signature !== 'string') {
        const error = new Error('Transaktion konnte nicht gesendet werden') as TransactionError;
        error.type = TransactionErrorType.TRANSACTION_ERROR;
        throw error;
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      this.validateBlockDetails(blockhash, lastValidBlockHeight);
      
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      });

      if (confirmation.value.err) {
        const error = new Error('NFT minting failed') as TransactionError;
        error.type = TransactionErrorType.CONFIRMATION_ERROR;
        error.details = confirmation.value.err;
        throw error;
      }

      return mint;
    } catch (error) {
      console.error('NFT Minting fehlgeschlagen:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('NFT Minting fehlgeschlagen'),
        context: { 
          action: 'mint_nft',
          wallet: getWalletAddress(wallet),
          name,
          x,
          y,
          error: error instanceof Error ? error.message : 'Unknown error'
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
    }, 'get_wallet_balance');
  }
}

// Export des SolanaService
export const solanaService = new SolanaService();