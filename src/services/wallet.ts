import { PublicKey } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { z } from 'zod';
import { monitoring } from './monitoring';

const WalletValidationSchema = z.object({
  publicKey: z.instanceof(PublicKey),
  connected: z.boolean(),
  signTransaction: z.function(),
  signAllTransactions: z.function(),
  signMessage: z.function(),
});

export class WalletValidationService {
  static validateWallet(wallet: WalletContextState): boolean {
    try {
      if (!wallet) {
        throw new Error('Wallet instance is missing');
      }
      WalletValidationSchema.parse(wallet);
      return true;
    } catch (error) {
      console.error('Wallet validation failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Wallet validation failed'),
        context: { action: 'validate_wallet' }
      });
      return false;
    }
  }

  static async validateBalance(wallet: WalletContextState, requiredAmount: number): Promise<boolean> {
    if (!wallet?.publicKey) {
      throw new Error('Wallet nicht verbunden');
    }

    try {
      const connection = wallet.wallet?.adapter?.connection;
      if (!connection) {
        throw new Error('Keine Wallet-Verbindung verfügbar');
      }

      const balance = await connection.getBalance(wallet.publicKey);
      const hasEnoughBalance = balance >= requiredAmount;

      if (!hasEnoughBalance) {
        monitoring.logEvent('insufficient_balance', {
          required: requiredAmount,
          actual: balance,
          wallet: wallet?.publicKey?.toString?.() ?? ''
        });
      }

      return hasEnoughBalance;
    } catch (error) {
      console.error('Balance validation failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Balance validation failed'),
        context: { 
          action: 'validate_balance',
          wallet: wallet?.publicKey?.toString?.() ?? '',
          requiredAmount 
        }
      });
      return false;
    }
  }

  static validateOwnership(walletAddress: string, ownerAddress: string): boolean {
    try {
      if (!walletAddress || !ownerAddress) {
        throw new Error('Wallet oder Owner Adresse fehlt');
      }

      if (!walletAddress.startsWith('0x') && !walletAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        throw new Error('Ungültige Wallet-Adresse');
      }

      if (!ownerAddress.startsWith('0x') && !ownerAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        throw new Error('Ungültige Owner-Adresse');
      }

      return new PublicKey(walletAddress).equals(new PublicKey(ownerAddress));
    } catch (error) {
      console.error('Ownership validation failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Ownership validation failed'),
        context: { 
          action: 'validate_ownership',
          walletAddress,
          ownerAddress 
        }
      });
      return false;
    }
  }

  static validateTransaction(transaction: string): boolean {
    try {
      if (!transaction) {
        throw new Error('Keine Transaktion angegeben');
      }

      // Basic format validation for base64 encoded transaction
      if (!transaction.match(/^[A-Za-z0-9+/=]+$/)) {
        throw new Error('Ungültiges Transaktionsformat');
      }

      return true;
    } catch (error) {
      console.error('Transaction validation failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Transaction validation failed'),
        context: { action: 'validate_transaction' }
      });
      return false;
    }
  }
}