import { StateCreator } from 'zustand';
import { PixelData } from '../types';
import { getSupabase } from '../lib/supabase';
import { monitoring } from '../services/monitoring';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface PixelGridState {
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
}

export const createPixelActions: StateCreator<PixelGridState> = (set, get) => {
  const GRID_SIZE = 1000;
  let realtimeSubscription: RealtimeChannel | null = null;

  return {
    pixels: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)),
    selectedPixel: null,
    loading: false,
    error: null,

    cleanup: async () => {
      if (realtimeSubscription) {
        try {
          await realtimeSubscription.unsubscribe();
          realtimeSubscription = null;
        } catch (error) {
          monitoring.logError({
            error: error instanceof Error ? error : new Error('Failed to unsubscribe'),
            context: { action: 'cleanup_subscription' }
          });
        }
      }
    },

    setupRealtimeSubscription: async () => {
      try {
        // Cleanup existing subscription if any
        if (realtimeSubscription) {
          await realtimeSubscription.unsubscribe();
          realtimeSubscription = null;
        }

        const supabase = await getSupabase();
        realtimeSubscription = supabase
          .channel('pixels-updates')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'pixels'
            },
            async (payload) => {
              const { new: newPixel } = payload;
              if (!newPixel) return;

              const pixels = get().pixels;
              const { x, y } = newPixel;

              if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
                const updatedPixels = pixels.map(row => [...row]);
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
      } catch (error) {
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to setup realtime subscription'),
          context: { action: 'setup_subscription' }
        });
      }
    },

    setSelectedPixel: (pixel) => {
      set({ selectedPixel: pixel ? { x: pixel.x, y: pixel.y } : null });
    },

    updatePixel: async (pixel) => {
      try {
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
        console.error('Error updating pixel:', error);
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to update pixel'),
          context: { action: 'update_pixel', pixel }
        });
        throw error;
      }
    },

    loadPixels: async (startRow = 0, startCol = 0, endRow = GRID_SIZE - 1, endCol = GRID_SIZE - 1) => {
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
        const updatedPixels = pixels.map(row => [...row]);
        
        // Reset pixels in range
        for (let y = startRow; y <= endRow; y++) {
          for (let x = startCol; x <= endCol; x++) {
            updatedPixels[y][x] = null;
          }
        }

        // Update with received pixels
        data.forEach((pixel: PixelData) => {
          if (pixel.x >= 0 && pixel.x < GRID_SIZE && pixel.y >= 0 && pixel.y < GRID_SIZE) {
            updatedPixels[pixel.y][pixel.x] = pixel;
          }
        });

        set({ pixels: updatedPixels, loading: false });
      } catch (error) {
        console.error('Error loading pixels:', error);
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

    getPixelData: (x, y) => {
      const pixels = get().pixels;
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        return pixels[y][x];
      }
      return null;
    }
  };
};
