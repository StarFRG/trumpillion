import { render, screen, fireEvent, act } from '@testing-library/react';
import PixelGrid from '../PixelGrid';
import { usePixelStore } from '../../store/pixelStore';
import { supabase } from '../../lib/supabase';

// Mock OpenSeadragon
jest.mock('openseadragon', () => {
  return jest.fn().mockImplementation(() => ({
    addHandler: jest.fn(),
    removeHandler: jest.fn(),
    destroy: jest.fn(),
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
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
    storage: {
      from: jest.fn(() => ({
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'test.jpg' } })),
      })),
    },
  },
}));

// Mock Pixel Store
jest.mock('../../store/pixelStore', () => ({
  usePixelStore: jest.fn(),
}));

describe('PixelGrid Component', () => {
  beforeEach(() => {
    (usePixelStore as jest.Mock).mockImplementation(() => ({
      pixels: [],
      loadPixels: jest.fn(),
      getPixelData: jest.fn(),
    }));
  });

  it('renders loading state initially', () => {
    render(<PixelGrid />);
    expect(screen.getByText(/lade bild/i)).toBeInTheDocument();
  });

  it('handles image load error', async () => {
    (supabase.from as jest.Mock).mockImplementationOnce(() => ({
      select: jest.fn().mockResolvedValue({ data: null, error: new Error('Failed to load') }),
    }));

    render(<PixelGrid />);
    await screen.findByText(/failed to load/i);
  });

  it('initializes OpenSeadragon viewer', () => {
    render(<PixelGrid />);
    expect(screen.getByRole('presentation')).toBeInTheDocument();
  });
});