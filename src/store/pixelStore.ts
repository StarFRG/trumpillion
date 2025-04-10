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
const LOAD_RETRY_ATTEMPTS = 3;
const LOAD_RETRY_DELAY = 2000;

export const usePixelStore = create<PixelGridState>()((set, get) => {
  let realtimeSubscription: any = null;

  return {
    pixels: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)),
    selectedPixel: null,
    loading: false,
    error: null,

    cleanup: async () => {
      if (realtimeSubscription) {
        await realtimeSubscription.unsubscribe();
      }
    },

    setupRealtimeSubscription: async () => {
      try {
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
                const updatedPixels = pixels.map(row => [...row]);
                updatedPixels[y][x] = newPixel;
                set({ pixels: updatedPixels });
              }
            }
          )
          .subscribe();
      } catch (error) {
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to setup realtime subscription'),
          context: { action: 'setup_realtime' }
        });
      }
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
        const updatedPixels = pixels.map(row => [...row]);
        updatedPixels[pixel.y][pixel.x] = pixel;
        set({ pixels: updatedPixels });
      } catch (error) {
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to update pixel'),
          context: { action: 'update_pixel', pixel }
        });
        throw error;
      }
    },

    loadPixels: async (startRow = 0, startCol = 0, endRow = GRID_SIZE - 1, endCol = GRID_SIZE - 1) => {
      if (!validateCoordinates(startRow, startCol) || !validateCoordinates(endRow, endCol)) {
        throw new Error('Invalid coordinate range');
      }

      let attempts = 0;
      let lastError: Error | null = null;

      while (attempts < LOAD_RETRY_ATTEMPTS) {
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

          if (!Array.isArray(data)) {
            throw new Error('Invalid response format from database');
          }

          const pixels = get().pixels;
          const updatedPixels = pixels.map(row => [...row]);
          
          // Reset pixels in range
          for (let y = startRow; y <= endRow; y++) {
            for (let x = startCol; x <= endCol; x++) {
              if (updatedPixels[y]) {
                updatedPixels[y][x] = null;
              }
            }
          }

          // Update with validated pixels
          data.forEach((pixel: PixelData) => {
            if (validatePixel(pixel)) {
              updatedPixels[pixel.y][pixel.x] = pixel;
            }
          });

          set({ pixels: updatedPixels, loading: false, error: null });
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Failed to load pixels');
          attempts++;
          
          if (attempts < LOAD_RETRY_ATTEMPTS) {
            console.warn(`Pixel load attempt ${attempts} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, LOAD_RETRY_DELAY));
          }
        }
      }

      const errorMessage = lastError?.message || 'Failed to load pixels after multiple attempts';
      monitoring.logError({
        error: lastError || new Error(errorMessage),
        context: { 
          action: 'load_pixels',
          startRow,
          startCol,
          endRow,
          endCol,
          attempts
        }
      });
      set({ error: errorMessage, loading: false });
    },

    getPixelData: (x: number, y: number) => {
      if (!validateCoordinates(x, y)) return null;
      
      const pixels = get().pixels;
      return pixels[y]?.[x] || null;
    },

    findAvailablePixel: async () => {
      try {
        const supabase = await getSupabase();
        const { data: lastPixel } = await supabase
          .from('pixels')
          .select('x, y')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Start from center if no pixels exist
        if (!lastPixel) {
          return { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) };
        }

        const searchRadius = 10;
        const xRange = Array.from({ length: searchRadius * 2 + 1 }, (_, i) => lastPixel.x - searchRadius + i);
        const yRange = Array.from({ length: searchRadius * 2 + 1 }, (_, i) => lastPixel.y - searchRadius + i);

        // Get all pixels in search area
        const { data: existingPixels } = await supabase
          .from('pixels')
          .select('x, y')
          .in('x', xRange)
          .in('y', yRange);

        // Create set of taken coordinates
        const taken = new Set(existingPixels?.map(p => `${p.x},${p.y}`));

        // Find first available coordinate
        for (const y of yRange) {
          for (const x of xRange) {
            if (validateCoordinates(x, y) && !taken.has(`${x},${y}`)) {
              return { x, y };
            }
          }
        }

        // If no pixel found in search area, expand search
        for (let radius = searchRadius + 1; radius < GRID_SIZE / 2; radius++) {
          const { data: pixels } = await supabase
            .from('pixels')
            .select('x, y')
            .or(`x.eq.${lastPixel.x - radius},x.eq.${lastPixel.x + radius}`)
            .or(`y.eq.${lastPixel.y - radius},y.eq.${lastPixel.y + radius}`);

          const takenExpanded = new Set(pixels?.map(p => `${p.x},${p.y}`));

          for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
              const x = lastPixel.x + dx;
              const y = lastPixel.y + dy;
              if (validateCoordinates(x, y) && !takenExpanded.has(`${x},${y}`)) {
                return { x, y };
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