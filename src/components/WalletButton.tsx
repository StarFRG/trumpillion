import { FC, memo, useCallback } from 'react';
import { useWalletConnection } from '../hooks/useWalletConnection';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Wallet, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { isWalletConnected, getWalletAddress, formatWalletAddress } from '../utils/walletUtils';
import { monitoring } from '../services/monitoring';

interface WalletButtonProps {
  minimal?: boolean;
}

export const WalletButton: FC<WalletButtonProps> = memo(({ minimal = false }) => {
  const { 
    wallet, 
    isConnecting, 
    connectionError, 
    isReconnecting,
    reconnectAttempts,
    connect,
    disconnect 
  } = useWalletConnection();

  const renderError = useCallback((message: string, error?: Error, context?: Record<string, unknown>) => {
    if (error) {
      monitoring.logError({
        error,
        context: {
          ...context,
          component: 'WalletButton',
          errorStack: error.stack || 'No stack trace available'
        }
      });
    }

    return (
      <div className="wallet-button-container">
        <div className="text-red-500 text-sm bg-red-500/10 px-3 py-2 rounded-lg">
          {message}
        </div>
      </div>
    );
  }, []);

  if (!wallet) {
    const error = new Error('Wallet initialization failed');
    return renderError('Wallet konnte nicht initialisiert werden', error, { action: 'wallet_init', walletState: 'unavailable' });
  }

  if (minimal && isWalletConnected(wallet)) {
    const walletAddress = getWalletAddress(wallet);
    if (!walletAddress) {
      const error = new Error('Invalid wallet address');
      return renderError('Ungültige Wallet-Adresse', error, { 
        action: 'get_wallet_address',
        walletAddress,
        walletState: wallet ? 'available' : 'unavailable'
      });
    }

    return (
      <div className="wallet-button-container">
        <div className="flex items-center gap-1 text-green-400 text-sm">
          <Wallet size={16} className="text-green-400" />
          <span title={walletAddress}>
            {formatWalletAddress(walletAddress)}
          </span>
        </div>
      </div>
    );
  }

  const isConnected = isWalletConnected(wallet) || isConnecting;

  const handleWalletAction = useCallback(async () => {
    try {
      if (isWalletConnected(wallet)) {
        await disconnect();
      } else {
        await connect();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Wallet action failed');
      monitoring.logError({
        error: err,
        context: { 
          action: isWalletConnected(wallet) ? 'disconnect' : 'connect',
          errorMessage: err.message,
          component: 'WalletButton'
        }
      });
    }
  }, [wallet, connect, disconnect]);

  if (connectionError) {
    monitoring.logError({
      error: new Error(connectionError),
      context: { action: 'wallet_connection', connectionError }
    });
  }

  return (
    <div className="wallet-button-container relative">
      <div className="flex items-center gap-1">
        {!isConnected && (
          <Wallet className="text-gray-300" size={16} />
        )}
        {isConnecting && (
          <Loader2 className="animate-spin text-gray-300" size={16} />
        )}
        <WalletMultiButton 
          className={clsx('wallet-button', { 
            connected: isWalletConnected(wallet),
            error: !!connectionError,
            connecting: isConnecting,
            reconnecting: isReconnecting
          })} 
          onClick={handleWalletAction}
        />
        {connectionError && (
          <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-red-500/10 border border-red-500 rounded text-sm text-red-500">
            <div className="font-medium">Verbindungsfehler:</div>
            <div className="text-sm opacity-90">{connectionError}</div>
            {isReconnecting && (
              <div className="text-xs mt-1 flex items-center gap-2">
                <Loader2 className="animate-spin" size={12} />
                <span>
                  Versuche, wieder zu verbinden... 
                  <span className="font-medium">Versuch {reconnectAttempts}/3</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

WalletButton.displayName = 'WalletButton';

export default WalletButton;