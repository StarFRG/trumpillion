import { PublicKey } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { z } from 'zod';
import { monitoring } from './monitoring';
import { solanaService } from './solana';
import { isWalletConnected, getWalletAddress, getWalletPublicKey } from '../utils/walletUtils';

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
        throw new Error('Wallet-Instanz fehlt');
      }
      WalletValidationSchema.parse(wallet);
      return true;
    } catch (error) {
      console.error('Wallet-Validierung fehlgeschlagen:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Wallet-Validierung fehlgeschlagen'),
        context: { action: 'validate_wallet' }
      });
      return false;
    }
  }

  static async validateBalance(wallet: WalletContextState, requiredAmount: number): Promise<boolean> {
    if (!isWalletConnected(wallet)) {
      throw new Error('Wallet ist nicht verbunden');
    }

    const pubkey = getWalletPublicKey(wallet);
    if (!pubkey) throw new Error('Wallet ist nicht verbunden');

    try {
      const connection = await solanaService.getConnection();
      const balance = await connection.getBalance(pubkey);
      const hasEnoughBalance = typeof balance === 'number' && balance >= requiredAmount;

      if (!hasEnoughBalance) {
        monitoring.logEvent('insufficient_balance', {
          required: requiredAmount,
          actual: balance,
          wallet: getWalletAddress(wallet)
        });
      }

      return hasEnoughBalance;
    } catch (error) {
      console.error('Guthaben-Validierung fehlgeschlagen:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Guthaben-Validierung fehlgeschlagen'),
        context: { 
          action: 'validate_balance',
          wallet: getWalletAddress(wallet),
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

      if (!walletAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        throw new Error('Ungültige Wallet-Adresse');
      }

      if (!ownerAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        throw new Error('Ungültige Owner-Adresse');
      }

      return new PublicKey(walletAddress).equals(new PublicKey(ownerAddress));
    } catch (error) {
      console.error('Eigentums-Validierung fehlgeschlagen:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Eigentums-Validierung fehlgeschlagen'),
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

      if (!transaction.match(/^[A-HJ-NP-Za-km-z0-9]{43,44}$/)) {
        throw new Error('Ungültiges Transaktionsformat');
      }

      return true;
    } catch (error) {
      console.error('Transaktions-Validierung fehlgeschlagen:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Transaktions-Validierung fehlgeschlagen'),
        context: { action: 'validate_transaction' }
      });
      return false;
    }
  }
}
