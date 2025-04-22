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
    try {
      if (!isWalletConnected(wallet)) {
        throw new Error('WALLET_NOT_CONNECTED');
      }

      validateFile(file);

      if (file.size > 10 * 1024 * 1024) {
        throw new Error('FILE_TOO_LARGE');
      }

      setUploading(true);
      setError(null);

      // Check pixel availability first
      await validatePixelAvailability(coordinates.x, coordinates.y);

      if (!file.type.startsWith('image/')) {
        throw new Error('INVALID_IMAGE');
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (!fileExt) {
        throw new Error('INVALID_IMAGE');
      }

      const allowedExts = ['jpg', 'jpeg', 'png', 'gif'];
      if (!allowedExts.includes(fileExt)) {
        throw new Error('UNSUPPORTED_IMAGE_TYPE');
      }

      const arrayBuffer = await file.arrayBuffer();

      // Magic Bytes Validation
      const header = new Uint8Array(arrayBuffer.slice(0, 4));
      const isPNG = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
      const isJPEG = header[0] === 0xFF && header[1] === 0xD8;
      const isGIF = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;

      if (!isPNG && !isJPEG && !isGIF) {
        throw new Error('INVALID_IMAGE_BYTES');
      }

      const mimeType = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif'
      }[fileExt] || 'image/jpeg';

      const cleanExt = fileExt.replace(/[^a-z0-9]/gi, '') || 'jpg';
      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${cleanExt}`;
      const correctedFile = new File([arrayBuffer], fileName, { type: mimeType });

      const supabase = await getSupabase();

      const { data: publicUrlData } = supabase.storage.from('pixel-images').getPublicUrl(fileName);
      if (publicUrlData?.publicUrl) {
        await supabase.storage.from('pixel-images').remove([fileName]);
      }

      const { data: storageData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, correctedFile, {
          cacheControl: '3600',
          upsert: true,
          contentType: mimeType
        });

      if (storageError) throw storageError;

      const { data } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!data?.publicUrl) {
        throw new Error('UPLOAD_FAILED');
      }

      // Validate URL format
      const isValid = /^https:\/\/.*\/pixel-images\/.*\.(png|jpg|jpeg|gif)$/i.test(data.publicUrl);
      if (!isValid) {
        throw new Error('INVALID_IMAGE_URL_FORMAT');
      }

      // Update selected pixel in store
      setSelectedPixel({
        x: coordinates.x,
        y: coordinates.y,
        imageUrl: data.publicUrl
      });

      return data.publicUrl;
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
  }, [wallet, validatePixelAvailability, setSelectedPixel]);

  return {
    uploading,
    error,
    uploadPixel,
    validatePixelAvailability
  };
};

export default usePixelUpload;