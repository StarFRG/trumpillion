import React, { useCallback, useState, useEffect } from 'react';
import { useWalletConnection } from '../../hooks/useWalletConnection';
import { Upload, X } from 'lucide-react';
import { usePixelStore } from '../../store/pixelStore';
import { getSupabase } from '../../lib/supabase';
import { solanaService } from '../../services/solana';
import { useTranslation } from 'react-i18next';
import { monitoring } from '../../services/monitoring';
import { validateFile } from '../../utils/validation';
import { ShareModal } from '../ShareModal';

interface PixelModalProps {
  isOpen: boolean;
  onClose: () => void;
  pixel: { x: number; y: number } | null;
  setSelectedPixel: (pixel: { x: number; y: number } | null) => void;
  fromButton: boolean;
}

const PixelModal: React.FC<PixelModalProps> = ({ isOpen, onClose, pixel, setSelectedPixel, fromButton }) => {
  const { t } = useTranslation();
  const { wallet, connect, isConnecting } = useWalletConnection();
  const { findAvailablePixel } = usePixelStore();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [nftUrl, setNftUrl] = useState<string | null>(null);
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !wallet?.connected) return;

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
            throw new Error(t('pixel.error.noFreePixel'));
          }
        }
      } catch (error) {
        console.error('Error initializing pixel:', error);
        monitoring.logError({
          error: error instanceof Error ? error : new Error('Failed to initialize pixel'),
          context: { action: 'initialize_pixel' }
        });
        setError(error instanceof Error ? error.message : t('pixel.error.noFreePixel'));
      } finally {
        setLoading(false);
      }
    };

    initializePixel();
  }, [isOpen, wallet?.connected, pixel, fromButton, findAvailablePixel, setSelectedPixel, t]);

  const handleFileSelect = useCallback((file: File) => {
    try {
      validateFile(file);
      
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      
      const newPreviewUrl = URL.createObjectURL(file);
      setPreviewUrl(newPreviewUrl);
      setUploadedFile(file);
      setError(null);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : t('pixel.upload.error.format'));
      return false;
    }
  }, [previewUrl, t]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (handleFileSelect(file)) {
        e.target.value = '';
      }
    }
  }, [handleFileSelect]);

  const handleCancel = useCallback(async () => {
    if (uploadedImageUrl) {
      const fileName = uploadedImageUrl.split('/').pop();
      if (fileName) {
        const supabase = await getSupabase();
        await supabase.storage.from('pixel-images').remove([fileName]);
      }
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setUploadedImageUrl(null);
    setUploadedFile(null);
    setTitle('');
    setDescription('');
    setShowShareDialog(false);
    setNftUrl(null);
    setSelectedCoordinates(null);
    onClose();
  }, [uploadedImageUrl, previewUrl, onClose]);

  const handleMint = useCallback(async () => {
    if (!wallet?.connected || !wallet?.publicKey) {
      setError(t('wallet.error.notConnected'));
      return;
    }

    if (!uploadedFile || !selectedCoordinates) {
      setError(t('pixel.upload.error.noFile'));
      return;
    }

    if (!title || !description) {
      setError(t('pixel.error.noDetails'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const txId = await solanaService.processPayment(wallet);
      if (!txId) {
        throw new Error('Payment failed');
      }

      const fileExt = uploadedFile.name.split('.').pop();
      const fileName = `pixel_${selectedCoordinates.x}_${selectedCoordinates.y}.${fileExt}`;
      
      const supabase = await getSupabase();
      
      const { data: existingFile } = await supabase.storage
        .from('pixel-images')
        .list('', { 
          search: fileName 
        });

      if (existingFile?.length) {
        await supabase.storage
          .from('pixel-images')
          .remove([fileName]);
      }

      const { data: storageData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, uploadedFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (storageError) throw storageError;

      const publicData = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!publicData?.data?.publicUrl) {
        throw new Error('Public URL konnte nicht generiert werden');
      }

      const publicUrl = publicData.data.publicUrl;
      setUploadedImageUrl(publicUrl);

      const nftAddress = await solanaService.mintNFT(
        wallet,
        title,
        description,
        publicUrl,
        selectedCoordinates.x,
        selectedCoordinates.y
      );

      const nftUrl = `https://solscan.io/token/${nftAddress}?cluster=devnet`;
      setNftUrl(nftUrl);

      const { error: dbError } = await supabase
        .from('pixels')
        .upsert({
          x: selectedCoordinates.x,
          y: selectedCoordinates.y,
          image_url: publicUrl,
          nft_url: nftUrl,
          owner: wallet?.publicKey?.toString?.() ?? ''
        });

      if (dbError) throw dbError;

      setUploadSuccess(true);
      setShowShareDialog(true);
      if (!showShareDialog) {
  setUploadedFile(null);
  setPreviewUrl(null);
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
          wallet: wallet?.publicKey?.toString?.() ?? ''
        }
      });
      setError(error instanceof Error ? error.message : t('common.error'));
      
      if (uploadedImageUrl) {
        const fileName = uploadedImageUrl.split('/').pop();
        if (fileName) {
          const supabase = await getSupabase();
          await supabase.storage.from('pixel-images').remove([fileName]);
        }
        setUploadedImageUrl(null);
      }
    } finally {
      setLoading(false);
    }
  }, [uploadedFile, selectedCoordinates, wallet, title, description, t]);

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
            className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors overflow-hidden
              ${isDragging ? 'border-red-500 bg-red-500/10' : 'border-gray-700 hover:border-red-500'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('fileInput')?.click()}
            style={{ minHeight: '200px' }}
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
                  <p className="text-white text-sm">Choose another image</p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="mx-auto mb-4 text-gray-400" size={32} />
                <p className="text-gray-300">
                  Add your personal touch - Drop an image here
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  JPG, PNG or GIF • Max 10MB • Make it count!
                </p>
              </>
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
            disabled={!uploadedFile || loading || !title || !description || !selectedCoordinates}
            className={`w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2
              ${uploadedFile && !loading && title && description && selectedCoordinates
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Creating your moment...
              </>
            ) : uploadSuccess ? (
              'Success! Your moment is now part of history!'
            ) : (
              'Mint Your Trump Moment (1 SOL)'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PixelModal;

export { PixelModal };
