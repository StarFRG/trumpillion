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
        throw new Error('Wallet ist nicht verbunden');
      }

      validateFile(file);
      setUploading(true);
      setError(null);

      const supabase = await getSupabase();
      
      const fileExt = file.name.split('.').pop();
      if (!fileExt) {
        throw new Error('Dateiendung konnte nicht ermittelt werden');
      }

      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${fileExt}`.replace(/^\/+/, '');

      const getMimeTypeFromExtension = (filename: string): string => {
        const ext = filename.toLowerCase().split('.').pop();
        switch (ext) {
          case 'jpg':
          case 'jpeg':
            return 'image/jpeg';
          case 'png':
            return 'image/png';
          case 'gif':
            return 'image/gif';
          default:
            return 'application/octet-stream';
        }
      };

      const inferredType = file.type || getMimeTypeFromExtension(file.name);
      const fileWithType = new File([file], file.name, { type: inferredType });

      // Check if file exists and remove if necessary
      const { data: publicUrlData } = supabase.storage.from('pixel-images').getPublicUrl(fileName);
      if (publicUrlData?.publicUrl) {
        await supabase.storage.from('pixel-images').remove([fileName]);
      }

      const { data: storageData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, fileWithType, {
          cacheControl: '3600',
          upsert: true,
          contentType: inferredType
        });

      if (storageError) throw storageError;

      const { data: publicData } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!publicData?.publicUrl) {
        throw new Error('Public URL konnte nicht generiert werden');
      }

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