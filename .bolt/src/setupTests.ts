import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
class IntersectionObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserver
});

// Mock ResizeObserver
class ResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserver
});

// Mock Solana wallet adapter
vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: vi.fn(() => ({
    connected: false,
    publicKey: null,
  })),
  ConnectionProvider: vi.fn(({ children }) => children),
  WalletProvider: vi.fn(({ children }) => children),
}));

// Mock wallet adapter UI
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletModalProvider: vi.fn(({ children }) => children),
  WalletMultiButton: vi.fn(() => null),
}));

// Mock wallet adapters
vi.mock('@solana/wallet-adapter-wallets', () => ({
  PhantomWalletAdapter: vi.fn(),
  SolflareWalletAdapter: vi.fn(),
}));

// Mock OpenSeadragon
vi.mock('openseadragon', () => {
  return vi.fn().mockImplementation(() => ({
    addHandler: vi.fn(),
    removeHandler: vi.fn(),
    destroy: vi.fn(),
    isOpen: () => true,
    viewport: {
      getZoom: () => 1,
      pointFromPixel: () => ({ x: 0, y: 0 }),
      imageToViewportCoordinates: () => ({ x: 0, y: 0 }),
      viewportToViewerElementCoordinates: () => ({ x: 0, y: 0 }),
    },
    canvas: document.createElement('canvas'),
  }));
});

// Mock Supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'test.jpg' } })),
      })),
    },
  },
}));

// Mock monitoring service
vi.mock('../services/monitoring', () => ({
  monitoring: {
    logError: vi.fn(),
    logEvent: vi.fn(),
  },
}));

// Mock window.open
window.open = vi.fn();

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

// Mock web3.js
vi.mock('@solana/web3.js', () => ({
  clusterApiUrl: vi.fn(() => 'https://api.devnet.solana.com'),
  Connection: vi.fn(),
}));