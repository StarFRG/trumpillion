import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getSupabase } from '../../lib/supabase';
import { validateFile } from '../../utils/validation';
import { monitoring } from '../../services/monitoring';

export const usePixelModalLogic = (onClose: () => void) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const wallet = useWallet();

  const handleUpload = useCallback(async (file: File, coordinates: { x: number; y: number }) => {
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
      if (!fileExt) throw new Error('File extension missing');

      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${fileExt}`;

      // Remove existing file if it exists
      const { data: existingFileList } = await supabase.storage
        .from('pixel-images')
        .list('', { search: fileName });

      if (existingFileList?.length) {
        await supabase.storage.from('pixel-images').remove([fileName]);
      }

      // Upload file
      const { data: uploadData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (storageError) throw storageError;

      // Get public URL
      const { data: publicData } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!publicData?.publicUrl) {
        throw new Error('Could not generate public URL');
      }

      const publicUrl = publicData.publicUrl;
      setImageUrl(publicUrl);

      // Insert pixel into DB
      const { error: dbError } = await supabase
        .from('pixels')
        .upsert({
          x: coordinates.x,
          y: coordinates.y,
          image_url: publicUrl,
          owner: wallet.publicKey?.toString() ?? ''
        });

      if (dbError) throw dbError;

      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Upload failed'),
        context: {
          action: 'upload_pixel',
          coordinates,
          wallet: wallet.publicKey?.toString()
        }
      });
      setError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [wallet.publicKey, onClose]);

  return {
    uploading,
    error,
    imageUrl,
    handleUpload
  };
};