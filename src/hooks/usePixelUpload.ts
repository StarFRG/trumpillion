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
        throw new Error('WALLET_NOT_CONNECTED');
      }

      validateFile(file);
      setUploading(true);
      setError(null);

      if (!file.type.startsWith('image/')) {
        throw new Error('INVALID_IMAGE');
      }

      const supabase = await getSupabase();
      
      const fileExt = file.name.split('.').pop();
      if (!fileExt) {
        throw new Error('INVALID_IMAGE');
      }

      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${fileExt}`;

      // Check if file exists and remove if necessary
      const { data: publicUrlData } = supabase.storage.from('pixel-images').getPublicUrl(fileName);
      if (publicUrlData?.publicUrl) {
        await supabase.storage.from('pixel-images').remove([fileName]);
      }

      const contentType = file.type && file.type.startsWith('image/')
        ? file.type
        : 'image/png';

      console.log('Uploading file with contentType:', contentType);

      const { data: storageData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
          contentType
        });

      if (storageError) throw storageError;

      const { data: publicData } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!publicData?.publicUrl) {
        throw new Error('UPLOAD_FAILED');
      }

      return publicData.publicUrl;
    } catch (error) {
      monitoring.logErrorWithContext(error, 'usePixelUpload:uploadPixel', {
        coordinates,
        wallet: getWalletAddress(wallet)
      });
      setError(getErrorMessage(error));
      throw error;
    } finally {
      setUploading(false);
    }
  }, [wallet]);

  const checkPixelAvailability = async (x: number, y: number): Promise<boolean> => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', x)
        .eq('y', y)
        .single();

      if (error) {
        monitoring.logErrorWithContext(error, 'usePixelUpload:checkPixelAvailability', {
          x,
          y,
          wallet: getWalletAddress(wallet)
        });
        throw new Error('SUPABASE_PIXEL_CHECK_FAILED');
      }

      return !data?.owner;
    } catch (error) {
      monitoring.logErrorWithContext(error, 'usePixelUpload:checkPixelAvailability', {
        x,
        y,
        wallet: getWalletAddress(wallet)
      });
      return false;
    }
  };

  return {
    uploading,
    error,
    uploadPixel,
    checkPixelAvailability
  };
};

export default usePixelUpload;