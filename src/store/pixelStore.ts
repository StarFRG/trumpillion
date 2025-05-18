import { create } from 'zustand';
import { PixelData } from '../types';
import { getSupabase } from '../lib/supabase';
import { validatePixel, validateCoordinates } from '../utils/validation';
import { monitoring } from '../services/monitoring';
import { RealtimeChannel } from '@supabase/supabase-js';

interface PixelGridState {
  pixels: PixelData[][];
  selectedPixel: { x: number; y: number } | null;
  loading: boolean;
  error: string | null;
  realtimeSubscription: RealtimeChannel | null;
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
  return {
    pixels: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)),
    selectedPixel: null,
    loading: false,
    error: null,
    realtimeSubscription: null,

    cleanup: async () => {
      const current = get().realtimeSubscription;
      if (current) {
        try {
          await current.unsubscribe();
          set({ realtimeSubscription: null });
        } catch (error) {
          monitoring.logError({
            error: error instanceof Error ? error : new Error('Failed to cleanup subscription'),
            context: { action: 'cleanup_subscription' }
          });
        }
      }
    },

    setupRealtimeSubscription: async () => {
      try {
        const existing = get().realtimeSubscription;
        if (existing) {
          await existing.unsubscribe();
          set({ realtimeSubscription: null });
        }

        const supabase = await getSupabase();

        const subscription = supabase
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
                const updatedPixels = [...pixels];
                updatedPixels[y] = [...updatedPixels[y]];
                updatedPixels[y][x] = newPixel;
                set({ pixels: updatedPixels });
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ Subscribed to pixel changes');
            } else if (status === 'CHANNEL_ERROR') {
              monitoring.logError({
                error: new Error('Realtime subscription error'),
                context: { action: 'subscription_error', status }
              });
            }
          });

        set({ realtimeSubscription: subscription });
      } catch (error) {
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to setup realtime subscription'),
          context: { action: 'setup_realtime' }
        });
        throw error;
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
          throw new Error('INVALID_PIXEL_DATA');
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
        throw new Error('INVALID_COORDINATES');
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

        if (!Array.isArray(data)) {
          throw new Error('INVALID_RESPONSE_FORMAT');
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load pixels';
        monitoring.logError({
          error: error instanceof Error ? error : new Error(errorMessage),
          context: { 
            action: 'load_pixels',
            startRow,
            startCol,
            endRow,
            endCol
          }
        });
        set({ error: errorMessage, loading: false });
      }
    },

    getPixelData: (x: number, y: number) => {
      if (!validateCoordinates(x, y)) return null;
      
      const pixels = get().pixels;
      return pixels[y]?.[x] || null;
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

        if (!data?.length) {
          return { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) };
        }

        const lastPixel = data[0];
        const searchRadius = 10;

        const xRange = Array.from({ length: searchRadius * 2 + 1 }, (_, i) => lastPixel.x - searchRadius + i);
        const yRange = Array.from({ length: searchRadius * 2 + 1 }, (_, i) => lastPixel.y - searchRadius + i);

        const { data: existingPixels, error: searchError } = await supabase
          .from('pixels')
          .select('x, y')
          .in('x', xRange)
          .in('y', yRange);

        if (searchError) throw searchError;

        const taken = new Set(existingPixels?.map(p => `${p.x},${p.y}`));

        for (const y of yRange) {
          for (const x of xRange) {
            if (validateCoordinates(x, y) && !taken.has(`${x},${y}`)) {
              return { x, y };
            }
          }
        }

        for (let radius = searchRadius + 1; radius < GRID_SIZE / 2; radius++) {
          const xRange = Array.from({ length: radius * 2 + 1 }, (_, i) => lastPixel.x - radius + i);
          const yRange = Array.from({ length: radius * 2 + 1 }, (_, i) => lastPixel.y - radius + i);

          const { data: pixels, error: expandedSearchError } = await supabase
            .from('pixels')
            .select('x, y')
            .in('x', xRange)
            .in('y', yRange);

          if (expandedSearchError) throw expandedSearchError;

          const takenExpanded = new Set(pixels?.map(p => `${p.x},${p.y}`));

          for (const y of yRange) {
            for (const x of xRange) {
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