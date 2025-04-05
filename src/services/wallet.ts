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
    if (!wallet.publicKey) return false;

    try {
      const connection = wallet.wallet?.adapter?.connection;
      if (!connection) return false;

      const balance = await connection.getBalance(wallet.publicKey);
      const hasEnoughBalance = balance >= requiredAmount;

      if (!hasEnoughBalance) {
        monitoring.logEvent('insufficient_balance', {
          required: requiredAmount,
          actual: balance,
          wallet: wallet.publicKey.toString()
        });
      }

      return hasEnoughBalance;
    } catch (error) {
      console.error('Balance validation failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Balance validation failed'),
        context: { 
          action: 'validate_balance',
          wallet: wallet.publicKey.toString(),
          requiredAmount 
        }
      });
      return false;
    }
  }

  static validateOwnership(walletAddress: string, ownerAddress: string): boolean {
    try {
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
}