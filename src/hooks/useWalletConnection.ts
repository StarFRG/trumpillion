import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

export const useWalletConnection = () => {
  const wallet = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Load cached wallet status
  useEffect(() => {
    const cachedWalletType = localStorage.getItem('walletType');
    if (cachedWalletType && !wallet.connected) {
      connect(cachedWalletType);
    }
  }, []);

  // Save wallet type when connected
  useEffect(() => {
    if (wallet.connected && wallet.wallet?.adapter.name) {
      localStorage.setItem('walletType', wallet.wallet.adapter.name);
    }
  }, [wallet.connected, wallet.wallet?.adapter.name]);

  const connect = useCallback(async (walletType?: string) => {
    if (isConnecting || wallet.connected) return;

    try {
      setIsConnecting(true);
      setConnectionError(null);

      if (!wallet.wallet && walletType) {
        await wallet.select(walletType);
      }

      await wallet.connect();
      setReconnectAttempts(0);
    } catch (error) {
      console.error('Wallet connection error:', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');

      // Attempt reconnection
      if (reconnectAttempts < RECONNECT_ATTEMPTS) {
        setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connect(walletType);
        }, RECONNECT_DELAY * (reconnectAttempts + 1));
      }
    } finally {
      setIsConnecting(false);
    }
  }, [wallet, isConnecting, reconnectAttempts]);

  const disconnect = useCallback(async () => {
    try {
      await wallet.disconnect();
      localStorage.removeItem('walletType');
      setReconnectAttempts(0);
      setConnectionError(null);
    } catch (error) {
      console.error('Wallet disconnect error:', error);
    }
  }, [wallet]);

  return {
    connect,
    disconnect,
    isConnecting,
    connectionError,
    reconnectAttempts,
    isReconnecting: reconnectAttempts > 0,
    wallet
  };
};