import React, { useCallback, useState, useEffect } from 'react';
import { useWalletConnection } from '../../hooks/useWalletConnection';
import { usePixelStore } from '../../store/pixelStore';
import { getSupabase } from '../../lib/supabase';
import { monitoring } from '../../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../../utils/walletUtils';
import { validateFile } from '../../utils/validation';
import { X, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShareModal } from '../ShareModal';
import { solanaService } from '../../services/solana';

interface PixelModalProps {
  isOpen: boolean;
  onClose: () => void;
  pixel: { x: number; y: number } | null;
  setSelectedPixel: (pixel: { x: number; y: number } | null) => void;
  fromButton: boolean;
}

export const PixelModal: React.FC<PixelModalProps> = ({ isOpen, onClose, pixel, setSelectedPixel, fromButton }) => {
  const { t } = useTranslation();
  const { wallet, isConnecting, connectionError } = useWalletConnection();
  const { findAvailablePixel } = usePixelStore();
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [nftUrl, setNftUrl] = useState<string | null>(null);
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOpen || !wallet?.connected || !wallet.publicKey) return;

    setLoading(true);
    setError(null);

    const initializePixel = async () => {
      try {
        if (pixel) {
          const supabase = await getSupabase();
          const { data: existingPixel } = await supabase
            .from('pixels')
            .select('owner')
            .eq('x', pixel.x)
            .eq('y', pixel.y)
            .single();

          if (existingPixel?.owner) {
            throw new Error(t('pixel.error.alreadyOwned'));
          }

          setSelectedCoordinates(pixel);
        } else if (fromButton) {
          const availablePixel = await findAvailablePixel();
          if (availablePixel) {
            setSelectedCoordinates(availablePixel);
            setSelectedPixel(availablePixel);
          } else {
            setError('Leider sind aktuell keine freien Pixel verfügbar.');
            onClose();
            return;
          }
        }
      } catch (error) {
        console.error('Error initializing pixel:', error);
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to initialize pixel'),
          context: { 
            action: 'initialize_pixel',
            wallet: wallet.publicKey?.toBase58() ?? 'undefined'
          }
        });
        setError(error instanceof Error ? error.message : t('pixel.error.noFreePixel'));
      } finally {
        setLoading(false);
      }
    };

    initializePixel();
  }, [isOpen, wallet, pixel, fromButton, findAvailablePixel, setSelectedPixel, t, onClose]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    try {
      validateFile(file);
      
      if (!file.type.startsWith('image/')) {
        throw new Error('Nur Bilddateien (.png, .jpg, .gif) sind erlaubt!');
      }
      
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      
      const newPreviewUrl = URL.createObjectURL(file);
      setPreviewUrl(newPreviewUrl);
      return true;
    } catch (error) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setError(error instanceof Error ? error.message : 'Invalid file');
      return false;
    }
  }, [previewUrl]);

  const handleUpload = useCallback(async (file: File) => {
    if (!isWalletConnected(wallet)) {
      throw new Error('WALLET_NOT_CONNECTED');
    }

    if (!selectedCoordinates) {
      throw new Error('No coordinates selected');
      return;
    }

    try {
      validateFile(file);
      setLoading(true);
      setError(null);

      if (!file.type.startsWith('image/')) {
        throw new Error('INVALID_IMAGE');
      }

      const fileExt = file.name.split('.').pop();
      if (!fileExt) {
        throw new Error('INVALID_IMAGE');
      }

      const fileName = `pixel_${selectedCoordinates.x}_${selectedCoordinates.y}.${fileExt}`.replace(/^\/+/, '');

      const inferredType = file.type || getMimeTypeFromExtension(file.name);
      const fileWithType = new File([file], file.name, { type: inferredType });

      const supabase = await getSupabase();

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

      const { data } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!data?.publicUrl) {
        throw new Error('Public URL konnte nicht generiert werden');
      }

      setUploadedImageUrl(data.publicUrl);
    } catch (error) {
      console.error('Upload failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Upload failed'),
        context: { 
          action: 'upload_image',
          coordinates: selectedCoordinates,
          wallet: getWalletAddress(wallet)
        }
      });
      setError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, [wallet, selectedCoordinates]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && handleFileSelect(file)) {
      handleUpload(file);
    }
  }, [handleFileSelect, handleUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && handleFileSelect(file)) {
      handleUpload(file);
    }
  }, [handleFileSelect, handleUpload]);

  const handleCancel = useCallback(async () => {
    if (uploadedImageUrl) {
      const fileName = uploadedImageUrl.split('/').pop();
      if (fileName) {
        try {
          const supabase = await getSupabase();
          await supabase.storage.from('pixel-images').remove([fileName]);
        } catch (error) {
          monitoring.logError({
            error: error instanceof Error ? error : new Error('Failed to remove uploaded image'),
            context: { 
              action: 'cancel_upload', 
              fileName,
              wallet: wallet?.publicKey?.toBase58() ?? 'undefined'
            }
          });
        }
      }
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setUploadedImageUrl(null);
    setTitle('');
    setDescription('');
    setShowShareDialog(false);
    setNftUrl(null);
    setSelectedCoordinates(null);
    setPreviewUrl(null);
    setError(null);
    onClose();
  }, [uploadedImageUrl, previewUrl, onClose, wallet]);

  const handleMint = useCallback(async () => {
    if (!isWalletConnected(wallet)) {
      setError(t('wallet.error.notConnected'));
      return;
    }

    if (!wallet?.publicKey) {
      setError(t('wallet.error.noAddress'));
      return;
    }

    if (!uploadedImageUrl || !selectedCoordinates) {
      setError(t('pixel.upload.error.noFile'));
      return;
    }

    if (!title || !description) {
      setError(t('pixel.error.noDetails'));
      return;
    }

    if (loading || processingPayment) return;

    setLoading(true);
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
          imageUrl: uploadedImageUrl,
          x: selectedCoordinates.x,
          y: selectedCoordinates.y
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'MINT_FAILED');
      }

      const { mint } = await response.json();
      const nftUrl = `https://solscan.io/token/${mint}`;
      setNftUrl(nftUrl);

      const supabase = await getSupabase();
      const { error: dbError } = await supabase
        .from('pixels')
        .upsert({
          x: selectedCoordinates.x,
          y: selectedCoordinates.y,
          image_url: uploadedImageUrl,
          nft_url: nftUrl,
          owner: getWalletAddress(wallet)
        });

      if (dbError) {
        monitoring.logError({
          error: dbError,
          context: {
            action: 'upsert_pixel',
            coordinates: selectedCoordinates,
            wallet: getWalletAddress(wallet),
            mint_address: mint
          }
        });
        throw dbError;
      }

      setUploadSuccess(true);
      setShowShareDialog(true);
      if (!showShareDialog) {
        setUploadedImageUrl(null);
        setTitle('');
        setDescription('');
      }
    } catch (error) {
      console.error('Error:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to mint NFT'),
        context: { 
          action: 'mint_nft',
          coordinates: selectedCoordinates,
          wallet: getWalletAddress(wallet)
        }
      });
      setError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setLoading(false);
      setProcessingPayment(false);
    }
  }, [uploadedImageUrl, selectedCoordinates, wallet, title, description, t, loading, processingPayment]);

  if (!isOpen) return null;

  if (showShareDialog) {
    return (
      <ShareModal
        isOpen={showShareDialog}
        onClose={handleCancel}
        pixel={{
          x: selectedCoordinates?.x || 0,
          y: selectedCoordinates?.y || 0,
          imageUrl: uploadedImageUrl,
          title,
          description,
          nftUrl
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />
      <div className="relative bg-gray-900 rounded-xl shadow-xl p-6 w-[400px] max-w-[90vw] z-[60]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Create Your Trump Moment</h3>
          <button 
            onClick={handleCancel}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {!isWalletConnected(wallet) ? (
          <div className="text-center py-8">
            <p className="text-gray-300 mb-4">
              {isConnecting ? 'Connecting wallet...' : 'Please connect your wallet to continue'}
            </p>
            {connectionError && (
              <p className="text-red-500 text-sm mb-4">{connectionError}</p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Name Your Moment
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Make it memorable - use your name or a catchy title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tell Your Story
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500 h-24 resize-none"
                placeholder="Share why this moment matters to you. What does Trump mean to you? Make it personal!"
              />
            </div>

            <div
              className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors overflow-hidden min-h-[200px]
                ${isDragging ? 'border-red-500 bg-red-500/10' : 'border-gray-700 hover:border-red-500'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('fileInput')?.click()}
            >
              <input
                type="file"
                id="fileInput"
                className="hidden"
                accept="image/jpeg,image/jpg,image/png,image/gif"
                onChange={handleFileChange}
              />
              
              {previewUrl ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <img 
                    src={previewUrl} 
                    alt="Preview" 
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <p className="text-white text-sm">Click to choose another image</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <Upload className="mb-4 text-gray-400" size={32} />
                  <p className="text-gray-300 mb-2">
                    Drag and drop your image here, or click to browse
                  </p>
                  <p className="text-sm text-gray-500">
                    Supports JPG, PNG and GIF • Max 10MB
                  </p>
                </div>
              )}

              {(loading || processingPayment) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="ml-3 text-white">
                    {processingPayment ? 'Processing payment...' : 'Uploading...'}
                  </span>
                </div>
              )}
            </div>

            {selectedCoordinates && (
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-400">Your Pixel Location</p>
                <p className="font-mono text-white">
                  ({selectedCoordinates.x}, {selectedCoordinates.y})
                </p>
                <p className="text-sm text-gray-400 mt-2">Investment</p>
                <p className="font-mono text-white">1 SOL - Own a piece of history</p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-500">
                {error}
              </div>
            )}

            <button
              onClick={handleMint}
              disabled={!uploadedImageUrl || loading || processingPayment || !title || !description || !selectedCoordinates}
              className={`w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2
                ${uploadedImageUrl && !loading && !processingPayment && title && description && selectedCoordinates
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }`}
            >
              {loading || processingPayment ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  {processingPayment ? 'Processing payment...' : 'Creating NFT...'}
                </>
              ) : uploadSuccess ? (
                'Success! Your moment is now part of history!'
              ) : (
                'Mint Your Trump Moment (1 SOL)'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PixelModal;