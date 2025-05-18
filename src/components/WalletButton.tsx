import { FC, memo, useCallback } from 'react';
import { useWalletConnection } from '../hooks/useWalletConnection';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Wallet } from 'lucide-react';
import clsx from 'clsx';
import { isWalletConnected, formatWalletAddress, getWalletAddress } from '../utils/walletUtils';

interface WalletButtonProps {
  minimal?: boolean;
}

export const WalletButton: FC<WalletButtonProps> = memo(({ minimal = false }) => {
  const { wallet, isConnecting, connectionError, connect, disconnect } = useWalletConnection();

  const handleWalletAction = useCallback(async () => {
    try {
      if (isWalletConnected(wallet)) {
        await disconnect();
      } else {
        await connect();
      }
    } catch (error) {
      console.error('Wallet action failed:', error);
    }
  }, [wallet, connect, disconnect]);

  if (minimal && isWalletConnected(wallet)) {
    const address = getWalletAddress(wallet);
    return (
      <div className="flex items-center gap-1 text-green-400 text-sm">
        <Wallet size={16} />
        <span title={address}>{formatWalletAddress(address)}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <WalletMultiButton 
        className={clsx('wallet-button', {
          connected: isWalletConnected(wallet),
          connecting: isConnecting,
          error: !!connectionError
        })}
        onClick={handleWalletAction}
      />
      
      {connectionError && (
        <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-red-500/10 border border-red-500 rounded text-sm text-red-500">
          {connectionError}
        </div>
      )}
    </div>
  );
});

WalletButton.displayName = 'WalletButton';

export default WalletButton;