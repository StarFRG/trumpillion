import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PixelModal from '../PixelModal';
import { useWallet } from '@solana/wallet-adapter-react';
import { solanaService } from '../../services/solana';

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

    // Test with fromButton = true
    const { rerender } = render(
      <PixelModal
        isOpen={true}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={true}
      />
    );

    expect(screen.getByRole('button', { name: /buy now/i })).toBeInTheDocument();

    // Test with fromButton = false
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

    // Add a file
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/bild hochladen/i);
    fireEvent.change(input, { target: { files: [file] } });

    // Close modal
    rerender(
      <PixelModal
        isOpen={false}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={false}
      />
    );

    // Reopen modal
    rerender(
      <PixelModal
        isOpen={true}
        onClose={mockOnClose}
        pixel={mockPixel}
        setSelectedPixel={mockSetSelectedPixel}
        fromButton={false}
      />
    );

    // Check if file input is reset
    const newInput = screen.getByLabelText(/bild hochladen/i) as HTMLInputElement;
    expect(newInput.value).toBe('');
  });
});