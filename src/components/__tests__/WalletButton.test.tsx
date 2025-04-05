import { render, screen } from '@testing-library/react';
import { WalletButton } from '../WalletButton';
import { useWallet } from '@solana/wallet-adapter-react';

// Mock the wallet hook
jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn()
}));

describe('WalletButton Component', () => {
  beforeEach(() => {
    (useWallet as jest.Mock).mockReset();
  });

  it('renders minimal version when connected', () => {
    (useWallet as jest.Mock).mockReturnValue({ connected: true });
    render(<WalletButton minimal={true} />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders full version when not connected', () => {
    (useWallet as jest.Mock).mockReturnValue({ connected: false });
    render(<WalletButton />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});