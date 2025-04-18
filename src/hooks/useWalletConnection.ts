import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { monitoring } from '../services/monitoring';
import { isWalletConnected } from '../utils/walletUtils';

export const RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

export const useWalletConnection = () => {
  const wallet = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const isWalletReady = wallet?.connected && wallet?.publicKey;

  // Hinweis wenn Wallet installiert aber nicht bereit
  useEffect(() => {
    if (wallet.wallet && wallet.wallet.readyState !== 'Installed') {
      setConnectionError('Wallet ist nicht bereit – bitte Extension öffnen oder neu installieren.');
    }
  }, [wallet?.wallet?.readyState]);

  const connect = useCallback(async (walletType?: string) => {
    if (isConnecting || wallet?.connected) return;

    try {
      setIsConnecting(true);
      setConnectionError(null);

      // Grundlegende Wallet-Adapter Prüfung
      if (!wallet || !wallet.select || !wallet.connect) {
        throw new Error('Wallet-Adapter nicht initialisiert');
      }

      // Wenn noch kein Wallet ausgewählt wurde, Modal öffnen
      if (!wallet.wallet) {
        const selected = await wallet.select(walletType);
        if (!selected) return;
      }

      // Prüfe readyState
      if (wallet.wallet?.readyState !== 'Installed') {
        throw new Error('Wallet ist nicht bereit (readyState !== Installed)');
      }

      await wallet.connect();

      if (!wallet.publicKey) {
        throw new Error('Wallet verbunden, aber publicKey ist leer');
      }

      // Zusätzlicher Check für signTransaction-Fähigkeit
      if (!wallet.adapter?.signTransaction) {
        throw new Error('Der verwendete Wallet-Adapter unterstützt keine Transaktionen. Bitte Phantom oder Solflare Desktop verwenden.');
      }

      setReconnectAttempts(0);
      setIsReconnecting(false);
      setConnectionError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet-Verbindung fehlgeschlagen';
      console.error('Wallet-Verbindungsfehler:', message);
      setConnectionError(message);

      monitoring.logError({
        error: error instanceof Error ? error : new Error(message),
        context: {
          action: 'connect_wallet',
          attempt: reconnectAttempts + 1,
          walletType,
          readyState: wallet.wallet?.readyState,
          hasAdapter: !!wallet.adapter,
          hasSignTransaction: !!wallet.adapter?.signTransaction
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
      setReconnectAttempts(0);
      setIsReconnecting(false);
      setConnectionError(null);
    } catch (error) {
      console.error('Fehler beim Trennen der Wallet:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Wallet-Trennung fehlgeschlagen'),
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
    isWalletReady,
    wallet
  };
};
