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