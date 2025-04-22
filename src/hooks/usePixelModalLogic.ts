import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getSupabase } from '../lib/supabase';
import { validateFile } from '../utils/validation';
import { monitoring } from '../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../utils/walletUtils';
import { solanaService } from '../services/solana';
import { usePixelStore } from '../store/pixelStore';

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

  const handleUpload = useCallback(async (file: File, selectedCoordinates: { x: number; y: number }) => {
    if (!isWalletConnected(wallet)) throw new Error('WALLET_NOT_CONNECTED');
    if (!selectedCoordinates) throw new Error('INVALID_COORDINATES');

    try {
      setUploading(true);
      setError(null);
      
      // 1. Validate file
      validateFile(file);
      await validatePixelAvailability(selectedCoordinates.x, selectedCoordinates.y);

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
      const fileName = `pixel_${selectedCoordinates.x}_${selectedCoordinates.y}.${fileExt}`;

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

      setImageUrl(data.publicUrl);

      // 9. Set global state (important!)
      setSelectedPixel({
        x: selectedCoordinates.x,
        y: selectedCoordinates.y,
        imageUrl: data.publicUrl
      });

      return data.publicUrl;
    } catch (error) {
      console.error('Upload failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Upload failed'),
        context: { 
          action: 'upload_pixel',
          coordinates: selectedCoordinates,
          wallet: getWalletAddress(wallet)
        }
      });
      setError(error instanceof Error ? error.message : 'Upload failed');
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
      // Check pixel availability one last time before proceeding
      await validatePixelAvailability(coordinates.x, coordinates.y);

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

      // Now we can finally store the pixel in the database
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
      console.error('Error:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to mint NFT'),
        context: { 
          action: 'mint_nft',
          coordinates,
          wallet: getWalletAddress(wallet)
        }
      });
      setError(error instanceof Error ? error.message : 'Failed to mint NFT');
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