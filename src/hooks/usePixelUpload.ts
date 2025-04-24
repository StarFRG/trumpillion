import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getSupabase } from '../lib/supabase';
import { validateFile } from '../utils/validation';
import { monitoring } from '../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../utils/walletUtils';
import { usePixelStore } from '../store/pixelStore';

export const usePixelUpload = () => {
  const wallet = useWallet();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setSelectedPixel } = usePixelStore();

  const validatePixelAvailability = useCallback(async (x: number, y: number) => {
    try {
      const supabase = await getSupabase();
      const { data: existingPixel, error } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', x)
        .eq('y', y)
        .maybeSingle();

      if (error) {
        throw new Error('Failed to check pixel availability');
      }

      if (existingPixel?.owner) {
        throw new Error('PIXEL_ALREADY_TAKEN');
      }

      return true;
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to validate pixel'),
        context: { action: 'validate_pixel', x, y }
      });
      throw error;
    }
  }, []);

  const uploadPixel = useCallback(async (file: File, coordinates: { x: number; y: number }): Promise<string> => {
    if (!isWalletConnected(wallet)) throw new Error('WALLET_NOT_CONNECTED');
    if (!coordinates) throw new Error('INVALID_COORDINATES');

    try {
      setUploading(true);
      setError(null);
      
      // 1. Validate file
      validateFile(file);
      await validatePixelAvailability(coordinates.x, coordinates.y);

      // 2. Check magic bytes
      const arrayBuffer = await file.arrayBuffer();
      const header = new Uint8Array(arrayBuffer.slice(0, 4));
      
      // 3. Detect MIME type from bytes
      let detectedMime = 'image/jpeg';
      const isPNG = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
      const isJPEG = header[0] === 0xFF && header[1] === 0xD8;
      const isGIF = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;

      if (isPNG) detectedMime = 'image/png';
      else if (isGIF) detectedMime = 'image/gif';
      else if (!isJPEG) throw new Error('INVALID_IMAGE_BYTES');

      // 4. Create filename with correct extension
      const fileExt = detectedMime.split('/')[1]; // 'jpeg', 'png', etc.
      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${fileExt}`;

      // 5. Create blob with correct MIME type
      const blob = new Blob([arrayBuffer], { type: detectedMime });
      const correctedFile = new File([blob], fileName, { type: detectedMime });

      // 6. Delete old file (instead of upsert)
      const supabase = await getSupabase();
      await supabase.storage.from('pixel-images').remove([fileName]);

      // 7. Upload with secured MIME type
      const { error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, correctedFile, {
          cacheControl: '3600',
          contentType: detectedMime // Explicitly set
        });

      if (storageError) throw storageError;

      // 8. Get public URL
      const { data } = supabase.storage.from('pixel-images').getPublicUrl(fileName);
      if (!data?.publicUrl) throw new Error('UPLOAD_FAILED');

      // 9. Set global state (important!)
      setSelectedPixel({
        x: coordinates.x,
        y: coordinates.y,
        imageUrl: data.publicUrl
      });

      return data.publicUrl;
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
  }, [wallet, validatePixelAvailability, setSelectedPixel]);

  return {
    uploading,
    error,
    uploadPixel,
    validatePixelAvailability
  };
};

export default usePixelUpload;
