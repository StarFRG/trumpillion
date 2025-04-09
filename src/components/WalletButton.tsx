import { FC, memo } from 'react';
import { useWalletConnection } from '../hooks/useWalletConnection';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Wallet, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { RECONNECT_ATTEMPTS } from '../hooks/useWalletConnection';

interface WalletButtonProps {
  minimal?: boolean;
}

export const WalletButton: FC<WalletButtonProps> = memo(({ minimal = false }) => {
  const { 
    wallet, 
    isConnecting, 
    connectionError, 
    isReconnecting,
    reconnectAttempts 
  } = useWalletConnection();

  if (!wallet) {
    return null;
  }

  if (minimal && wallet.connected) {
    return (
      <div className="wallet-button-container">
        <div className="flex items-center gap-1 text-green-400 text-sm">
          <Wallet size={16} className="text-green-400" />
          {wallet.publicKey?.toBase58().slice(0, 4)}...
          {wallet.publicKey?.toBase58().slice(-4)}
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-button-container">
      <div className="flex items-center gap-1">
        {!wallet.connected && !isConnecting && <Wallet className="text-gray-300" size={16} />}
        {isConnecting && (
          <Loader2 className="animate-spin text-gray-300" size={16} />
        )}
        <WalletMultiButton className={clsx('wallet-button', { connected: wallet.connected })} />
        {connectionError && (
          <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-red-500/10 border border-red-500 rounded text-sm text-red-500">
            {connectionError}
            {isReconnecting && (
              <div className="text-xs mt-1">
                Reconnecting... Attempt {reconnectAttempts}/{RECONNECT_ATTEMPTS}
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