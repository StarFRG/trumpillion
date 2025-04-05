import { render } from '@testing-library/react';
import { WalletContextProvider } from '../WalletProvider';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { vi } from 'vitest';

vi.mock('@solana/wallet-adapter-react', () => ({
  ConnectionProvider: vi.fn(({ children }) => <div data-testid="connection-provider">{children}</div>),
  WalletProvider: vi.fn(({ children }) => <div data-testid="wallet-provider">{children}</div>),
  useWallet: vi.fn(() => ({
    connected: false,
    publicKey: null,
  })),
}));

vi.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletModalProvider: vi.fn(({ children }) => <div data-testid="modal-provider">{children}</div>),
}));

describe('WalletContextProvider', () => {
  it('provides wallet configuration', () => {
    const { getByTestId } = render(
      <WalletContextProvider>
        <div>Test Child</div>
      </WalletContextProvider>
    );
    
    expect(getByTestId('connection-provider')).toBeInTheDocument();
    expect(getByTestId('wallet-provider')).toBeInTheDocument();
    expect(getByTestId('modal-provider')).toBeInTheDocument();
  });

  it('renders children', () => {
    const { getByText } = render(
      <WalletContextProvider>
        <div>Test Child</div>
      </WalletContextProvider>
    );
    
    expect(getByText('Test Child')).toBeInTheDocument();
  });
});