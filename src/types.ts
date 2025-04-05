export const GRID_WIDTH = 1000;
export const GRID_HEIGHT = 1000;
export const GRID_COLS = GRID_WIDTH;
export const GRID_ROWS = GRID_HEIGHT;
export const PIXEL_SIZE = 1;

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

export interface Database {
  public: {
    Tables: {
      pixels: {
        Row: {
          id: string;
          x: number;
          y: number;
          owner: string | null;
          image_url: string;
          nft_url: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          x: number;
          y: number;
          owner?: string | null;
          image_url: string;
          nft_url?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          x?: number;
          y?: number;
          owner?: string | null;
          image_url?: string;
          nft_url?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      settings: {
        Row: {
          id: string;
          key: string;
          value: any;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          key: string;
          value: any;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          key?: string;
          value?: any;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
    };
  };
}