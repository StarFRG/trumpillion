import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PixelModal from '../PixelModal';
import { useWallet } from '@solana/wallet-adapter-react';
import { solanaService } from '../../services/solana';
import { getSupabase } from '../../lib/supabase';

// Mock wallet hook
jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn(),
}));

// Mock Solana service
jest.mock('../../services/solana', () => ({
  solanaService: {
    processPayment: jest.fn(),
    mintNFT: jest.fn(),
  },
}));

// Mock Supabase
jest.mock('../../lib/supabase', () => ({
  getSupabase: jest.fn().mockResolvedValue({
    from: jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ data: null, error: null }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'test.jpg' } })),
        remove: jest.fn().mockResolvedValue({ error: null }),
      })),
    },
  }),
}));

describe('PixelModal Component', () => {
  const mockPixel = { x: 100, y: 100 };
  const mockSetSelectedPixel = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    (useWallet as jest.Mock).mockReturnValue({
      connected: false,
      publicKey: null,
    });
  });

  it('renders connect wallet message when not connected', () => {
    render(
      <PixelModal
        isOpen={true}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={false}
      />
    );

    expect(screen.getByText(/bitte verbinde dein wallet/i)).toBeInTheDocument();
  });

  it('shows file upload when wallet is connected', () => {
    (useWallet as jest.Mock).mockReturnValue({
      connected: true,
      publicKey: 'test-public-key',
    });

    render(
      <PixelModal
        isOpen={true}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={false}
      />
    );

    expect(screen.getByText(/bild hochladen/i)).toBeInTheDocument();
  });

  it('validates file upload', async () => {
    (useWallet as jest.Mock).mockReturnValue({
      connected: true,
      publicKey: 'test-public-key',
    });

    render(
      <PixelModal
        isOpen={true}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={false}
      />
    );

    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const input = screen.getByLabelText(/bild hochladen/i);

    await waitFor(() => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(screen.getByText(/bitte nur jpg, png oder gif/i)).toBeInTheDocument();
  });

  it('shows correct button text based on fromButton prop', () => {
    (useWallet as jest.Mock).mockReturnValue({
      connected: true,
      publicKey: 'test-public-key',
    });

    const { rerender } = render(
      <PixelModal
        isOpen={true}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={true}
      />
    );

    expect(screen.getByRole('button', { name: /kaufen/i })).toBeInTheDocument();

    rerender(
      <PixelModal
        isOpen={true}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={false}
      />
    );

    expect(screen.getByRole('button', { name: /nft erstellen/i })).toBeInTheDocument();
  });

  it('resets state when modal is closed', () => {
    (useWallet as jest.Mock).mockReturnValue({
      connected: true,
      publicKey: 'test-public-key',
    });

    const { rerender } = render(
      <PixelModal
        isOpen={true}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={false}
      />
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/bild hochladen/i);
    fireEvent.change(input, { target: { files: [file] } });

    rerender(
      <PixelModal
        isOpen={false}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={false}
      />
    );

    rerender(
      <PixelModal
        isOpen={true}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={false}
      />
    );

    const newInput = screen.getByLabelText(/bild hochladen/i) as HTMLInputElement;
    expect(newInput.value).toBe('');
  });
});