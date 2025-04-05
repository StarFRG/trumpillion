import { create } from 'zustand';
import { PixelData } from '../types';
import { getSupabase } from '../lib/supabase';
import { validatePixel, validateCoordinates } from '../utils/validation';
import { monitoring } from '../services/monitoring';

interface PixelGridState {
  pixels: PixelData[][];
  selectedPixel: { x: number; y: number } | null;
  loading: boolean;
  error: string | null;
  cleanup: () => void;
  setupRealtimeSubscription: () => void;
  setSelectedPixel: (pixel: PixelData | null) => void;
  updatePixel: (pixel: PixelData) => Promise<void>;
  loadPixels: (startRow?: number, startCol?: number, endRow?: number, endCol?: number) => Promise<void>;
  getPixelData: (x: number, y: number) => PixelData | null;
  findAvailablePixel: () => Promise<{ x: number; y: number } | null>;
}

const GRID_SIZE = 1000;

export const usePixelStore = create<PixelGridState>()((set, get) => {
  let realtimeSubscription: any = null;

  return {
    pixels: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)),
    selectedPixel: null,
    loading: false,
    error: null,

    cleanup: () => {
      if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
      }
    },

    setupRealtimeSubscription: async () => {
      const supabase = await getSupabase();
      realtimeSubscription = supabase
        .channel('pixels')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'pixels'
          },
          async (payload) => {
            const { new: newPixel } = payload;
            if (!newPixel || !validatePixel(newPixel)) return;

            const pixels = get().pixels;
            const { x, y } = newPixel;

            if (validateCoordinates(x, y)) {
              pixels[y][x] = newPixel;
              set({ pixels: [...pixels] });
            }
          }
        )
        .subscribe();
    },

    setSelectedPixel: (pixel) => {
      if (!pixel || validateCoordinates(pixel.x, pixel.y)) {
        set({ selectedPixel: pixel ? { x: pixel.x, y: pixel.y } : null });
      }
    },

    updatePixel: async (pixel) => {
      try {
        if (!validatePixel(pixel)) {
          throw new Error('Invalid pixel data');
        }

        const supabase = await getSupabase();
        const { error } = await supabase
          .from('pixels')
          .upsert({
            x: pixel.x,
            y: pixel.y,
            image_url: pixel.imageUrl,
            owner: pixel.owner,
            nft_url: pixel.nftUrl
          });

        if (error) throw error;

        const pixels = get().pixels;
        pixels[pixel.y][pixel.x] = pixel;
        set({ pixels: [...pixels] });
      } catch (error) {
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to update pixel'),
          context: { action: 'update_pixel', pixel }
        });
        throw error;
      }
    },

    loadPixels: async (startRow = 0, startCol = 0, endRow = GRID_SIZE - 1, endCol = GRID_SIZE - 1) => {
      if (!validateCoordinates(startCol, startRow) || !validateCoordinates(endCol, endRow)) {
        throw new Error('Invalid coordinate range');
      }

      try {
        set({ loading: true, error: null });

        const supabase = await getSupabase();
        const { data, error } = await supabase
          .from('pixels')
          .select('*')
          .gte('x', startCol)
          .lte('x', endCol)
          .gte('y', startRow)
          .lte('y', endRow);

        if (error) throw error;

        const pixels = get().pixels;
        
        // Reset pixels in range
        for (let y = startRow; y <= endRow; y++) {
          for (let x = startCol; x <= endCol; x++) {
            pixels[y][x] = null;
          }
        }

        // Update with validated pixels
        data.forEach((pixel: PixelData) => {
          if (validatePixel(pixel)) {
            pixels[pixel.y][pixel.x] = pixel;
          }
        });

        set({ pixels: [...pixels], loading: false });
      } catch (error) {
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to load pixels'),
          context: { 
            action: 'load_pixels',
            startRow,
            startCol,
            endRow,
            endCol
          }
        });
        set({ 
          error: error instanceof Error ? error.message : 'Failed to load pixels',
          loading: false 
        });
      }
    },

    getPixelData: (x: number, y: number) => {
      if (!validateCoordinates(x, y)) return null;
      
      const pixels = get().pixels;
      return pixels[y][x];
    },

    findAvailablePixel: async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase
          .from('pixels')
          .select('x, y')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;

        // Start searching from the center if no pixels exist
        if (!data || data.length === 0) {
          return { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) };
        }

        // Find next available pixel in a spiral pattern
        const lastPixel = data[0];
        let x = lastPixel.x;
        let y = lastPixel.y;

        for (let radius = 1; radius < GRID_SIZE / 2; radius++) {
          for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
              const newX = x + dx;
              const newY = y + dy;

              if (validateCoordinates(newX, newY)) {
                const { data: existingPixel } = await supabase
                  .from('pixels')
                  .select('id')
                  .eq('x', newX)
                  .eq('y', newY)
                  .single();

                if (!existingPixel) {
                  return { x: newX, y: newY };
                }
              }
            }
          }
        }

        return null;
      } catch (error) {
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to find available pixel'),
          context: { action: 'find_available_pixel' }
        });
        throw error;
      }
    }
  };
});