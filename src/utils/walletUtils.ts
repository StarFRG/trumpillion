import { PublicKey } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { monitoring } from '../services/monitoring';

export const WALLET_ERRORS = {
  NOT_CONNECTED: 'Wallet ist nicht verbunden',
  INVALID_KEY: 'Ungültiger Public Key',
  OPERATION_FAILED: 'Wallet Operation fehlgeschlagen',
  TRANSACTION_FAILED: 'Transaktion fehlgeschlagen',
  INSUFFICIENT_BALANCE: 'Unzureichendes Guthaben',
  TIMEOUT: 'Zeitüberschreitung bei der Wallet-Operation',
} as const;

export const WALLET_TIMEOUTS = {
  TRANSACTION: 30000,
  CONNECTION: 10000,
  RETRY_DELAY: 2000,
} as const;

export function isValidPublicKey(key: any): key is PublicKey {
  return !!key && typeof key.toBase58 === 'function' && typeof key.toBuffer === 'function';
}

export function isWalletConnected(wallet: WalletContextState | null | undefined): boolean {
  return !!wallet?.connected && isValidPublicKey(wallet.publicKey);
}

export function getWalletPublicKey(wallet: WalletContextState | null | undefined): PublicKey | null {
  return isWalletConnected(wallet) ? wallet.publicKey : null;
}

export function getWalletAddressSafe(wallet: WalletContextState | null | undefined): string {
  try {
    const pubkey = getWalletPublicKey(wallet);
    return pubkey?.toString() ?? '';
  } catch (error) {
    monitoring.logError({
      error: error instanceof Error ? error : new Error('Failed to get wallet address'),
      context: { action: 'get_wallet_address_safe' }
    });
    return '';
  }
}

export function getWalletAddress(wallet: WalletContextState | null | undefined): string {
  const address = getWalletAddressSafe(wallet);
  if (!address) {
    throw new Error('Wallet ist nicht verbunden oder hat keine gültige Adresse');
  }
  return address;
}

export function formatWalletAddress(address: string, prefixLength = 4, suffixLength = 4): string {
  if (!address) {
    throw new Error('Keine Wallet-Adresse angegeben');
  }
  if (address.length <= prefixLength + suffixLength) return address;
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}

export function validateWalletTransaction(transaction: string): boolean {
  if (!transaction) return false;
  return /^[A-Za-z0-9+/=]+$/.test(transaction);
}

export function isValidWalletAddress(address: string): boolean {
  if (!address) return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export function safeParseWalletData<T>(data: unknown, fallback: T): T {
  try {
    if (!data) return fallback;
    return data as T;
  } catch (error) {
    monitoring.logError({
      error: error instanceof Error ? error : new Error('Failed to parse wallet data'),
      context: { action: 'parse_wallet_data' }
    });
    return fallback;
  }
}

export async function withWalletRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(WALLET_ERRORS.TIMEOUT)), WALLET_TIMEOUTS.TRANSACTION)
        )
      ]);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(WALLET_ERRORS.OPERATION_FAILED);

      if (attempt === maxRetries) {
        monitoring.logError({
          error: lastError,
          context: {
            action: 'wallet_retry',
            attempts: attempt,
            maxRetries
          }
        });
        throw lastError;
      }

      await new Promise(resolve => setTimeout(resolve, WALLET_TIMEOUTS.RETRY_DELAY));
    }
  }

  throw lastError || new Error(WALLET_ERRORS.OPERATION_FAILED);
}

export function withWalletErrorBoundary<T>(operation: () => T, fallback: T): T {
  try {
    return operation();
  } catch (error) {
    monitoring.logError({
      error: error instanceof Error ? error : new Error(WALLET_ERRORS.OPERATION_FAILED),
      context: { action: 'wallet_operation' }
    });
    return fallback;
  }
}