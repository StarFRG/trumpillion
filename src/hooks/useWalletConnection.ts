import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { monitoring } from '../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../utils/walletUtils';

export const useWalletConnection = () => {
  const wallet = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Store wallet address immediately when connected
  useEffect(() => {
    if (isWalletConnected(wallet)) {
      try {
        const address = getWalletAddress(wallet);
        localStorage.setItem('wallet', address);
        sessionStorage.setItem('wallet', address);
      } catch (error) {
        console.error('Failed to store wallet address:', error);
      }
    }
  }, [wallet?.connected, wallet?.publicKey]);

  const connect = useCallback(async () => {
    if (isConnecting || wallet?.connected) return;

    try {
      setIsConnecting(true);
      setConnectionError(null);

      if (!wallet?.connect) {
        throw new Error('Wallet nicht initialisiert');
      }

      await wallet.connect();

      if (!wallet.publicKey) {
        throw new Error('Wallet verbunden, aber keine Public Key vorhanden');
      }

      const address = getWalletAddress(wallet);
      localStorage.setItem('wallet', address);
      sessionStorage.setItem('wallet', address);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet-Verbindung fehlgeschlagen';
      console.error('Wallet connection error:', message);
      setConnectionError(message);

      monitoring.logError({
        error: error instanceof Error ? error : new Error(message),
        context: { action: 'connect_wallet' }
      });

      // Clear stored wallet on error
      localStorage.removeItem('wallet');
      sessionStorage.removeItem('wallet');
    } finally {
      setIsConnecting(false);
    }
  }, [wallet, isConnecting]);

  const disconnect = useCallback(async () => {
    try {
      if (!wallet?.disconnect) {
        throw new Error('Wallet nicht initialisiert');
      }

      await wallet.disconnect();
      
      localStorage.removeItem('wallet');
      sessionStorage.removeItem('wallet');
      
    } catch (error) {
      console.error('Wallet disconnect error:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Wallet-Trennung fehlgeschlagen'),
        context: { action: 'disconnect_wallet' }
      });
    }
  }, [wallet]);

  // Clear stored wallet if disconnected
  useEffect(() => {
    if (!isWalletConnected(wallet)) {
      localStorage.removeItem('wallet');
      sessionStorage.removeItem('wallet');
    }
  }, [wallet?.connected]);

  return {
    connect,
    disconnect,
    isConnecting,
    connectionError,
    wallet
  };
};