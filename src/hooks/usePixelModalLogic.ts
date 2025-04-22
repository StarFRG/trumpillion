import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getSupabase } from '../lib/supabase';
import { validateFile } from '../utils/validation';
import { monitoring } from '../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../utils/walletUtils';
import { solanaService } from '../services/solana';

export const usePixelModalLogic = (onClose: () => void) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const wallet = useWallet();

  const handleUpload = useCallback(async (file: File, coordinates: { x: number; y: number }) => {
    try {
      if (!isWalletConnected(wallet)) {
        throw new Error('WALLET_NOT_CONNECTED');
      }

      validateFile(file);

      // Check pixel availability first
      const supabase = await getSupabase();
      const { data: existingPixel } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', coordinates.x)
        .eq('y', coordinates.y)
        .maybeSingle();

      if (existingPixel?.owner) {
        throw new Error('PIXEL_ALREADY_TAKEN');
      }

      setUploading(true);
      setError(null);

      if (!file.type.startsWith('image/')) {
        throw new Error('INVALID_IMAGE');
      }

      const fileExt = file.name.split('.').pop();
      if (!fileExt) {
        throw new Error('INVALID_IMAGE');
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
      }[fileExt.toLowerCase()] || 'image/jpeg';

      const cleanExt = fileExt.replace(/[^a-z0-9]/gi, '') || 'jpg';
      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${cleanExt}`;
      const correctedFile = new File([arrayBuffer], fileName, { type: mimeType });

      // Check if file exists and remove if necessary
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

      const { data: publicData } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!publicData?.publicUrl) {
        throw new Error('UPLOAD_FAILED');
      }

      // Pixel wird erst nach erfolgreichem Mint gespeichert

      setImageUrl(publicData.publicUrl);
      return publicData.publicUrl;
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
      const supabase = await getSupabase();
      const { data: existingPixel } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', coordinates.x)
        .eq('y', coordinates.y)
        .maybeSingle();

      if (existingPixel?.owner) {
        throw new Error('PIXEL_ALREADY_TAKEN');
      }

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
      console.error('Submission failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Submission failed'),
        context: {
          action: 'submit_pixel',
          coordinates,
          wallet: getWalletAddress(wallet)
        }
      });
      setError(error instanceof Error ? error.message : 'Submission failed');
      throw error;
    } finally {
      setProcessingPayment(false);
    }
  }, [wallet, imageUrl]);

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