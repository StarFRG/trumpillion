import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getSupabase } from '../lib/supabase';
import { validateFile } from '../utils/validation';
import { monitoring } from '../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../utils/walletUtils';

export const usePixelUpload = () => {
  const wallet = useWallet();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadPixel = useCallback(async (file: File, coordinates: { x: number; y: number }): Promise<string> => {
    try {
      if (!isWalletConnected(wallet)) {
        throw new Error('Wallet is not connected');
      }

      validateFile(file);
      setUploading(true);
      setError(null);

      const supabase = await getSupabase();
      
      // Check if pixel is already taken
      const { data: existingPixel, error: checkError } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', coordinates.x)
        .eq('y', coordinates.y)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingPixel?.owner) {
        throw new Error('This pixel is already owned');
      }

      const fileExt = file.name.split('.').pop();
      if (!fileExt) {
        throw new Error('Could not determine file extension');
      }

      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${fileExt}`;

      // Check for and remove existing file
      const { data: existingFiles } = await supabase.storage
        .from('pixel-images')
        .list('', { search: fileName });

      if (existingFiles?.length) {
        await supabase.storage.from('pixel-images').remove([fileName]);
      }

      const { data: storageData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (storageError) throw storageError;

      const { data: publicData } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!publicData?.publicUrl) {
        throw new Error('Failed to generate public URL');
      }

      const publicUrl = publicData.publicUrl;

      const { error: dbError } = await supabase
        .from('pixels')
        .upsert({
          x: coordinates.x,
          y: coordinates.y,
          image_url: publicUrl,
          owner: getWalletAddress(wallet)
        });

      if (dbError) throw dbError;

      return publicUrl;
    } catch (error) {
      console.error('Upload failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Upload failed'),
        context: { 
          action: 'upload_pixel', 
          coordinates,
          wallet: getWalletAddress(wallet)
        }
      });
      setError(error instanceof Error ? error.message : 'Upload failed');
      throw error;
    } finally {
      setUploading(false);
    }
  }, [wallet]);

  return {
    uploading,
    error,
    uploadPixel
  };
};