import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getSupabase } from '../lib/supabase';
import { validateFile } from '../utils/validation';
import { monitoring } from '../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../utils/walletUtils';
import { solanaService } from '../services/solana';
import { getErrorMessage } from '../utils/errorMessages';

export const usePixelUpload = () => {
  const wallet = useWallet();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

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

      // Upload file to storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'image/png'
        });

      if (storageError) throw storageError;

      // Get public URL
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

  const mintPixel = useCallback(async (
    title: string,
    description: string,
    imageUrl: string,
    coordinates: { x: number; y: number }
  ): Promise<string> => {
    if (!isWalletConnected(wallet)) {
      throw new Error('WALLET_NOT_CONNECTED');
    }

    if (!wallet.publicKey) {
      throw new Error('WALLET_NOT_CONNECTED');
    }

    setProcessingPayment(true);
    setError(null);

    try {
      // Process payment first
      const txId = await solanaService.processPayment(wallet);
      console.log('Payment successful:', txId);

      // Call mint-nft function
      const response = await fetch('/.netlify/functions/mint-nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          wallet: wallet.publicKey.toString(),
          name: title,
          description,
          imageUrl,
          x: coordinates.x,
          y: coordinates.y
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'MINT_FAILED');
      }

      const { mint } = await response.json();
      const nftUrl = `https://solscan.io/token/${mint}`;

      const supabase = await getSupabase();
      const { error: dbError } = await supabase
        .from('pixels')
        .upsert({
          x: coordinates.x,
          y: coordinates.y,
          image_url: imageUrl,
          nft_url: nftUrl,
          owner: getWalletAddress(wallet)
        });

      if (dbError) {
        monitoring.logError({
          error: dbError,
          context: {
            action: 'upsert_pixel',
            coordinates,
            wallet: getWalletAddress(wallet),
            mint_address: mint
          }
        });
        throw dbError;
      }

      return nftUrl;
    } catch (error) {
      monitoring.logErrorWithContext(error, 'usePixelUpload:mintPixel', {
        coordinates,
        wallet: getWalletAddress(wallet)
      });
      setError(getErrorMessage(error));
      throw error;
    } finally {
      setProcessingPayment(false);
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
    processingPayment,
    uploadPixel,
    mintPixel,
    checkPixelAvailability
  };
};

export default usePixelUpload;
