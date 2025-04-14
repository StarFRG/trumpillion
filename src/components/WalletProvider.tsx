import React, { FC, ReactNode, useMemo, useState, useEffect } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { getRpcEndpoint } from '../lib/getRpcEndpoint';
import { monitoring } from '../services/monitoring';
import '@solana/wallet-adapter-react-ui/styles.css';

interface Props {
  children: ReactNode;
}

// Custom hook to safely handle localStorage
const useLocalStorageWithFallback = (key: string, initialValue: string | null = null) => {
  // Only try to get from localStorage on initial mount
  const getStoredValue = () => {
    try {
      const item = window.localStorage.getItem(key);
      // Return initialValue if item is null or empty
      if (!item) return initialValue;
      
      // Try to parse the item, if it fails return initialValue
      try {
        return JSON.parse(item);
      } catch {
        // If parsing fails, remove the invalid value
        window.localStorage.removeItem(key);
        return initialValue;
      }
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('LocalStorage access error'),
        context: { component: 'WalletProvider', key }
      });
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState(getStoredValue);

  const setValue = (value: any) => {
    try {
      // If value is null, remove the item
      if (value === null) {
        setStoredValue(null);
        window.localStorage.removeItem(key);
        return;
      }

      // Ensure we can stringify the value before setting it
      const stringValue = JSON.stringify(value);
      setStoredValue(value);
      window.localStorage.setItem(key, stringValue);
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('LocalStorage save error'),
        context: { component: 'WalletProvider', key }
      });
    }
  };

  return [storedValue, setValue] as const;
};

export const WalletContextProvider: FC<Props> = ({ children }) => {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  // Endpoint wird async geladen
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useLocalStorageWithFallback('selectedWallet');

  useEffect(() => {
    const initEndpoint = async () => {
      try {
        const rpcEndpoint = await getRpcEndpoint();
        setEndpoint(rpcEndpoint);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load RPC endpoint';
        setError(errorMessage);
        monitoring.logError({
          error: err instanceof Error ? err : new Error(errorMessage),
          context: { component: 'WalletProvider' }
        });
      }
    };

    initEndpoint();
  }, []);

  if (error) {
    return <div className="text-red-500">Fehler beim Laden der Wallet-Verbindung: {error}</div>;
  }

  if (!endpoint) {
    return <div>Lade Wallet-Verbindung...</div>;
  }

  return (
    <ConnectionProvider 
      endpoint={endpoint}
      config={{
        commitment: 'confirmed',
        wsEndpoint: endpoint.replace('https', 'wss'),
        confirmTransactionInitialTimeout: 60000
      }}
    >
      <WalletProvider 
        wallets={wallets} 
        autoConnect={false}
        localStorageKey="selectedWallet"
        onError={(error) => {
          console.error('Wallet error:', error);
          monitoring.logError({
            error: error instanceof Error ? error : new Error('Wallet error'),
            context: { component: 'WalletProvider' }
          });
        }}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletContextProvider;