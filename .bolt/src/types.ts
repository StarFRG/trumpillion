export interface Pixel {
  x: number;
  y: number;
  owner: string; // Kein `null`, stattdessen Standardwert ""
  imageUrl: string; // Kein `null`, stattdessen ""
  nftUrl: string; // Kein `null`, stattdessen ""
  lastUpdated: string; // Kein `null`, stattdessen ""

  // Database column mappings (optional)
  image_url?: string;
  nft_url?: string;
  last_updated?: string;

  // Additional metadata
  title?: string;
  description?: string;
}

export interface PixelData {
  x: number;
  y: number;
  imageUrl: string | null;
  title?: string;
  description?: string;
  owner?: string | null;
  nftUrl?: string | null;
  lastUpdated?: string | null;
}

export interface PixelGridState {
  pixels: Pixel[][];
  selectedPixel: { x: number; y: number } | null;
  zoomLevel: number;
  loading: boolean;
  error: string | null;
  setSelectedPixel: (x: number, y: number) => void;
  clearSelectedPixel: () => void;
  incrementZoom: () => void;
  resetZoom: () => void;
  loadPixels: () => Promise<void>;
  updatePixel: (pixel: Pixel) => Promise<void>;
  getPixelData: (x: number, y: number) => Pixel | null;
}

export interface PixelModalProps {
  pixel: { x: number; y: number } | null;
  onClose: () => void;
  pixelData?: PixelData;
}

export interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

// Constants for grid dimensions
export const GRID_WIDTH = 1000;
export const GRID_HEIGHT = 1000;
export const PIXEL_SIZE = 1;
export const TOTAL_PIXELS = GRID_WIDTH * GRID_HEIGHT;
export const GRID_COLS = GRID_WIDTH;
export const GRID_ROWS = GRID_HEIGHT;