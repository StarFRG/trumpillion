import { getSupabase } from '../lib/supabase';
import { PixelData } from '../types';
import { monitoring } from '../services/monitoring';

export class PixelService {
  async getPixel(x: number, y: number): Promise<PixelData | null> {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('pixels')
        .select('*')
        .eq('x', x)
        .eq('y', y)
        .single();

      if (error) throw error;
      if (!data) {
        throw new Error('Pixel nicht gefunden');
      }
      
      return data;
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to get pixel'),
        context: { action: 'get_pixel', x, y }
      });
      return null;
    }
  }

  async updatePixel(pixel: PixelData): Promise<boolean> {
    try {
      if (!pixel.x || !pixel.y || !pixel.imageUrl || !pixel.owner || !pixel.nftUrl) {
        throw new Error('Ungültige Pixel-Daten');
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
      return true;
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to update pixel'),
        context: { action: 'update_pixel', pixel }
      });
      throw error;
    }
  }

  async deletePixel(x: number, y: number): Promise<boolean> {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('pixels')
        .delete()
        .eq('x', x)
        .eq('y', y);

      if (error) throw error;
      return true;
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to delete pixel'),
        context: { action: 'delete_pixel', x, y }
      });
      throw error;
    }
  }
}

export const pixelService = new PixelService();
