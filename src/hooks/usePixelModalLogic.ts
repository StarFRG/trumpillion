import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getSupabase } from '../lib/supabase';
import { validateFile } from '../utils/validation';
import { monitoring } from '../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../utils/walletUtils';
import { solanaService } from '../services/solana';
import { usePixelStore } from '../store/pixelStore';
import { getErrorMessage } from '../utils/errorMessages';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

export const usePixelModalLogic = (onClose: () => void) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const wallet = useWallet();
  const { setSelectedPixel } = usePixelStore();

  const validatePixelAvailability = useCallback(async (x: number, y: number) => {
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        throw new Error('SUPABASE_NOT_INITIALIZED');
      }

      const { data: existingPixel, error } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', x)
        .eq('y', y)
        .maybeSingle();

      if (error) {
        throw new Error('SUPABASE_PIXEL_CHECK_FAILED');
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

  const handleUpload = useCallback(async (file: File, selectedCoordinates: { x: number; y: number }) => {
    if (!isWalletConnected(wallet)) throw new Error('WALLET_NOT_CONNECTED');
    if (!selectedCoordinates) throw new Error('INVALID_COORDINATES');

    let attempts = 0;
    let lastError: Error | null = null;
    let uploadedUrl: string | null = null;

    try {
      setUploading(true);
      setError(null);

      validateFile(file);
      await validatePixelAvailability(selectedCoordinates.x, selectedCoordinates.y);

      const arrayBuffer = await file.arrayBuffer();
      const header = new Uint8Array(arrayBuffer.slice(0, 4));
      
      let detectedMime = 'image/jpeg';
      const isPNG = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
      const isJPEG = header[0] === 0xFF && header[1] === 0xD8;
      const isGIF = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;

      if (isPNG) detectedMime = 'image/png';
      else if (isGIF) detectedMime = 'image/gif';
      else if (!isJPEG) throw new Error('INVALID_IMAGE_BYTES');

      const fileExt = detectedMime.split('/')[1];
      const fileName = `pixel_${selectedCoordinates.x}_${selectedCoordinates.y}.${fileExt}`;

      const blob = new Blob([arrayBuffer], { type: detectedMime });
      const correctedFile = new File([blob], fileName, { type: detectedMime });

      while (attempts < MAX_ATTEMPTS) {
        try {
          const supabase = await getSupabase();
          if (!supabase) {
            throw new Error('SUPABASE_NOT_INITIALIZED');
          }

          const { error: storageError } = await supabase.storage
            .from('pixel-images')
            .upload(fileName, correctedFile, {
              cacheControl: '3600',
              contentType: detectedMime,
              upsert: true
            });

          if (storageError) throw storageError;

          const { data } = supabase.storage.from('pixel-images').getPublicUrl(fileName);
          if (!data?.publicUrl) throw new Error('UPLOAD_FAILED');

          const headCheck = await fetch(data.publicUrl, { method: 'HEAD' });
          if (!headCheck.ok) {
            throw new Error('PUBLIC_URL_NOT_ACCESSIBLE');
          }

          uploadedUrl = data.publicUrl;
          setImageUrl(uploadedUrl);

          setSelectedPixel({
            x: selectedCoordinates.x,
            y: selectedCoordinates.y,
            imageUrl: uploadedUrl
          });

          return uploadedUrl;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Upload failed');
          attempts++;

          if (attempts === MAX_ATTEMPTS) {
            throw lastError;
          }

          console.warn(`Upload attempt ${attempts} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempts));
        }
      }

      throw lastError || new Error('UPLOAD_FAILED');
    } catch (error) {
      console.error('Upload failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Upload failed'),
        context: { 
          action: 'upload_pixel',
          coordinates: selectedCoordinates,
          wallet: getWalletAddress(wallet),
          attempts
        }
      });
      setError(getErrorMessage(error));
      throw error;
    } finally {
      setUploading(false);
    }
  }, [wallet, validatePixelAvailability, setSelectedPixel]);

  const handleSubmit = useCallback(async (title: string, description: string, coordinates: { x: number; y: number }) => {
    if (!isWalletConnected(wallet)) {
      throw new Error('WALLET_NOT_CONNECTED');
    }

    if (!wallet.publicKey) {
      throw new Error('WALLET_NOT_CONNECTED');
    }

    if (!imageUrl) {
      throw new Error('INVALID_IMAGE');
    }

    setProcessingPayment(true);
    setError(null);

    try {
      await validatePixelAvailability(coordinates.x, coordinates.y);

      const txId = await solanaService.processPayment(wallet);
      console.log('Payment successful:', txId);

      const response = await fetch('/.netlify/functions/mint-nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-application-name': 'trumpillion'
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
      if (!supabase) {
        throw new Error('SUPABASE_NOT_INITIALIZED');
      }

      const { error: dbError } = await supabase
        .from('pixels')
        .upsert({
          x: coordinates.x,
          y: coordinates.y,
          image_url: imageUrl,
          nft_url: nftUrl,
          owner: getWalletAddress(wallet)
        }, {
          onConflict: 'x,y'
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
      console.error('Error:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to mint NFT'),
        context: { 
          action: 'mint_nft',
          coordinates,
          wallet: getWalletAddress(wallet)
        }
      });
      setError(getErrorMessage(error));
      throw error;
    } finally {
      setProcessingPayment(false);
    }
  }, [wallet, imageUrl, validatePixelAvailability]);

  const cleanup = useCallback(() => {
    setError(null);
    setImageUrl(null);
    setUploading(false);
    setProcessingPayment(false);
  }, []);

  return {
    uploading,
    error,
    imageUrl,
    processingPayment,
    handleUpload,
    handleSubmit,
    cleanup
  };
};