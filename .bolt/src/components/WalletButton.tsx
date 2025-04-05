import { FC, memo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Wallet } from 'lucide-react';

interface WalletButtonProps {
  minimal?: boolean;
}

export const WalletButton: FC<WalletButtonProps> = memo(({ minimal = false }) => {
  const { connected } = useWallet();

  if (minimal && connected) {
    return (
      <div className="wallet-button-container">
        <div className="flex items-center gap-0 text-gray-300 hover:text-white transition-colors">
          <Wallet size={16} />
          <span className="text-sm">Connected</span>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-button-container">
      <div className="flex items-center gap-0">
        <Wallet className="text-gray-300" size={20} />
        <WalletMultiButton className={`wallet-button ${connected ? 'connected' : ''}`} />
      </div>
    </div>
  );
});

WalletButton.displayName = 'WalletButton';