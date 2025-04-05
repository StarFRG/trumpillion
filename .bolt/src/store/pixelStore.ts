import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/supabase';
import { PixelGridState, Pixel, GRID_WIDTH, GRID_HEIGHT, PIXEL_SIZE, GRID_COLS, GRID_ROWS } from '../types';

export const usePixelStore = create<PixelGridState>((set, get) => {
  let pixelChannel: ReturnType<typeof supabase.channel> | null = null;

  const initializeGrid = () => 
    Array(GRID_ROWS).fill(null).map((_, row) => 
      Array(GRID_COLS).fill(null).map((_, col) => ({
        x: col,
        y: row,
        owner: "",
        imageUrl: "",
        nftUrl: "",
        lastUpdated: new Date().toISOString()
      }))
    );

  const setupRealtimeSubscription = () => {
    if (pixelChannel) {
      pixelChannel.unsubscribe();
    }

    pixelChannel = supabase
      .channel('pixels')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'pixels' 
      }, payload => {
        const { new: newPixel, eventType } = payload;
        
        set(state => {
          const x = newPixel.x;
          const y = newPixel.y;
          
          if (y >= 0 && y < GRID_ROWS && x >= 0 && x < GRID_COLS) {
            const newGrid = [...state.pixels];
            
            if (eventType === 'DELETE') {
              newGrid[y][x] = {
                x,
                y,
                owner: "",
                imageUrl: "",
                nftUrl: "",
                lastUpdated: new Date().toISOString()
              };
            } else {
              newGrid[y][x] = {
                x: newPixel.x,
                y: newPixel.y,
                owner: newPixel.owner || "",
                imageUrl: newPixel.image_url || "",
                nftUrl: newPixel.nft_url || "",
                lastUpdated: newPixel.updated_at || new Date().toISOString()
              };
            }
            
            return { pixels: newGrid };
          }
          return state;
        });
      })
      .subscribe();
  };

  return {
    pixels: initializeGrid(),
    selectedPixel: null,
    zoomLevel: 0,
    loading: false,
    error: null,

    setSelectedPixel: (x: number, y: number) => {
      if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
        set({ selectedPixel: { x, y } });
      }
    },

    clearSelectedPixel: () => {
      set({ selectedPixel: null, zoomLevel: 0 });
    },

    incrementZoom: () => {
      set((state) => ({
        zoomLevel: state.zoomLevel < 3 ? state.zoomLevel + 1 : state.zoomLevel
      }));
    },

    resetZoom: () => {
      set({ zoomLevel: 0 });
    },

    loadPixels: async () => {
      const state = get();
      if (state.loading) return;

      set({ loading: true, error: null });

      try {
        const { data, error } = await supabase
          .from('pixels')
          .select('*')
          .order('updated_at', { ascending: false });

        if (error) throw error;

        const grid = initializeGrid();

        if (data) {
          data.forEach(pixel => {
            if (pixel.x >= 0 && pixel.x < GRID_COLS && 
                pixel.y >= 0 && pixel.y < GRID_ROWS) {
              grid[pixel.y][pixel.x] = {
                x: pixel.x,
                y: pixel.y,
                owner: pixel.owner || "",
                imageUrl: pixel.image_url || "",
                nftUrl: pixel.nft_url || "",
                lastUpdated: pixel.updated_at || new Date().toISOString()
              };
            }
          });
        }

        set({ pixels: grid, loading: false });
        setupRealtimeSubscription();
      } catch (error) {
        console.error('Error loading pixels:', error);
        set({ 
          loading: false, 
          error: error instanceof Error ? error.message : 'Failed to load pixels' 
        });
      }
    },

    updatePixel: async (pixel: Pixel) => {
      set({ loading: true, error: null });
      
      try {
        const { data, error } = await supabase
          .from('pixels')
          .upsert({
            x: pixel.x,
            y: pixel.y,
            owner: pixel.owner || "",
            image_url: pixel.imageUrl || "",
            nft_url: pixel.nftUrl || "",
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;

        set(state => {
          const newGrid = [...state.pixels];
          if (newGrid[pixel.y] && newGrid[pixel.y][pixel.x]) {
            newGrid[pixel.y][pixel.x] = {
              ...pixel,
              lastUpdated: data.updated_at || new Date().toISOString()
            };
          }
          return { 
            pixels: newGrid, 
            loading: false,
            error: null
          };
        });
      } catch (error) {
        console.error('Error updating pixel:', error);
        set({ 
          loading: false, 
          error: error instanceof Error ? error.message : 'Failed to update pixel' 
        });
      }
    },

    getPixelData: (x: number, y: number) => {
      const state = get();
      if (y >= 0 && y < GRID_ROWS && x >= 0 && x < GRID_COLS) {
        return state.pixels[y][x];
      }
      return null;
    }
  };
});

// Cleanup on unmount
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const store = usePixelStore.getState();
    if (store.pixels) {
      supabase.channel('pixels').unsubscribe();
    }
  });
}