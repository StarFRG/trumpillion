import { render, screen, fireEvent } from '@testing-library/react';
import { ShareModal } from '../ShareModal';

describe('ShareModal Component', () => {
  const mockPixel = {
    x: 100,
    y: 100,
    imageUrl: 'test.jpg',
    title: 'Test Pixel',
    description: 'Test Description',
  };

  beforeEach(() => {
    // Mock window.open
    window.open = jest.fn();
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(),
      },
    });
  });

  it('renders share buttons', () => {
    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        pixel={mockPixel}
      />
    );

    expect(screen.getByText('Twitter')).toBeInTheDocument();
    expect(screen.getByText('Facebook')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText(/link kopieren/i)).toBeInTheDocument();
  });

  it('shows pixel details', () => {
    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        pixel={mockPixel}
      />
    );

    expect(screen.getByText(mockPixel.title)).toBeInTheDocument();
    expect(screen.getByText(mockPixel.description)).toBeInTheDocument();
  });

  it('copies link to clipboard', async () => {
    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        pixel={mockPixel}
      />
    );

    fireEvent.click(screen.getByText(/link kopieren/i));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('opens social share windows', () => {
    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        pixel={mockPixel}
      />
    );

    fireEvent.click(screen.getByText('Twitter'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('twitter.com'),
      '_blank'
    );

    fireEvent.click(screen.getByText('Facebook'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('facebook.com'),
      '_blank'
    );
  });
});