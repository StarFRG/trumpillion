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
        .maybeSingle();

      if (error) throw error;
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
        throw new Error('Invalid pixel data');
      }

      const supabase = await getSupabase();

      // Check if pixel exists and is not already owned
      const { data: existingPixel, error: checkError } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', pixel.x)
        .eq('y', pixel.y)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingPixel?.owner && existingPixel.owner !== pixel.owner) {
        throw new Error('Pixel is already owned by someone else');
      }

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

      // Check if pixel exists
      const { data: existingPixel, error: checkError } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', x)
        .eq('y', y)
        .maybeSingle();

      if (checkError) throw checkError;
      if (!existingPixel) {
        throw new Error('Pixel not found');
      }

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