import { useState, useCallback } from 'react';
import { getSupabase } from '../lib/supabase';
import { validateFile } from '../utils/validation';
import { monitoring } from '../services/monitoring';

export const usePixelUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadPixel = useCallback(async (file: File, coordinates: { x: number; y: number }) => {
    try {
      validateFile(file);
      setUploading(true);
      setError(null);

      const supabase = await getSupabase();
      
      // Check if pixel is already taken
      const { data: existingPixel } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', coordinates.x)
        .eq('y', coordinates.y)
        .single();

      if (existingPixel?.owner) {
        throw new Error('This pixel is already owned');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${fileExt}`;

      const { data: storageData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (storageError) throw storageError;

      const { data } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!data) {
        throw new Error('Keine Daten von getPublicUrl erhalten');
      }

      const publicUrl = data.publicUrl;
      if (!publicUrl || !publicUrl.startsWith('http')) {
        throw new Error('Ungültige oder fehlende Public URL');
      }

      const { error: dbError } = await supabase
        .from('pixels')
        .insert({
          x: coordinates.x,
          y: coordinates.y,
          image_url: publicUrl
        });

      if (dbError) throw dbError;

      return publicUrl;
    } catch (error) {
      console.error('Upload failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Upload failed'),
        context: { action: 'upload_pixel', coordinates }
      });
      setError(error instanceof Error ? error.message : 'Upload failed');
      throw error;
    } finally {
      setUploading(false);
    }
  }, []);

  return {
    uploading,
    error,
    uploadPixel
  };
};