import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { monitoring } from '../services/monitoring';

export const RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;
const WALLET_STORAGE_KEY = 'walletType';

export const useWalletConnection = () => {
  const wallet = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const cachedWalletType = localStorage.getItem(WALLET_STORAGE_KEY);
    if (cachedWalletType && !wallet?.connected) {
      connect(cachedWalletType);
    }
  }, []);

  useEffect(() => {
    if (wallet?.connected && wallet?.wallet?.adapter?.name) {
      localStorage.setItem(WALLET_STORAGE_KEY, wallet.wallet.adapter.name);
    }
  }, [wallet?.connected, wallet?.wallet?.adapter?.name]);

  const connect = useCallback(async (walletType?: string) => {
    if (isConnecting || wallet?.connected) return;

    try {
      setIsConnecting(true);
      setConnectionError(null);

      if (!wallet?.wallet && walletType) {
        await wallet?.select(walletType);
      }

      if (!wallet) {
        throw new Error('Wallet-Instanz nicht verfügbar');
      }

      await wallet.connect();
      setReconnectAttempts(0);
      setIsReconnecting(false);
    } catch (error) {
      console.error('Wallet Verbindungsfehler:', error);
      const errorMessage = error instanceof Error ? error.message : 'Verbindung fehlgeschlagen';
      setConnectionError(errorMessage);

      monitoring.logError({
        error: error instanceof Error ? error : new Error(errorMessage),
        context: { 
          action: 'connect_wallet',
          walletType,
          attempt: reconnectAttempts + 1
        }
      });

      if (reconnectAttempts < RECONNECT_ATTEMPTS) {
        setIsReconnecting(true);
        setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connect(walletType);
        }, RECONNECT_DELAY * (reconnectAttempts + 1));
      } else {
        setIsReconnecting(false);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [wallet, isConnecting, reconnectAttempts]);

  const disconnect = useCallback(async () => {
    try {
      if (!wallet) {
        throw new Error('Wallet-Instanz nicht verfügbar');
      }

      await wallet.disconnect();
      localStorage.removeItem(WALLET_STORAGE_KEY);
      setReconnectAttempts(0);
      setIsReconnecting(false);
      setConnectionError(null);
    } catch (error) {
      console.error('Wallet Trennungsfehler:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Trennung fehlgeschlagen'),
        context: { action: 'disconnect_wallet' }
      });
    }
  }, [wallet]);

  return {
    connect,
    disconnect,
    isConnecting,
    connectionError,
    reconnectAttempts,
    isReconnecting,
    wallet
  };
};