import React, { useCallback, useState, useEffect } from 'react';
import { useWalletConnection } from '../../hooks/useWalletConnection';
import { usePixelStore } from '../../store/pixelStore';
import { getSupabase } from '../../lib/supabase';
import { monitoring } from '../../services/monitoring';
import { getWalletAddress, isWalletConnected } from '../../utils/walletUtils';
import { useMintNft } from '../../hooks/useMintNft';
import { PixelForm } from '../PixelForm/PixelForm';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShareModal } from '../ShareModal';

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
  const { mintNft } = useMintNft();
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [nftUrl, setNftUrl] = useState<string | null>(null);
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !wallet?.connected || !wallet.publicKey) return;

    setLoading(true);
    setError(null);

    const initializePixel = async () => {
      try {
        if (pixel) {
          // Store wallet address for Supabase RLS
          localStorage.setItem('wallet', getWalletAddress(wallet));
          
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
  }, [isOpen, wallet, pixel, fromButton, findAvailablePixel, setSelectedPixel, t]);

  const handleUploadSuccess = useCallback((imageUrl: string) => {
    setUploadedImageUrl(imageUrl);
    setError(null);
  }, []);

  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

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
    setUploadedImageUrl(null);
    setTitle('');
    setDescription('');
    setShowShareDialog(false);
    setNftUrl(null);
    setSelectedCoordinates(null);
    onClose();
  }, [uploadedImageUrl, onClose, wallet]);

  const handleMint = useCallback(async () => {
    if (!isWalletConnected(wallet)) {
      setError(t('wallet.error.notConnected'));
      return;
    }

    if (!wallet?.publicKey) {
      setError(t('wallet.error.noAddress'));
      return;
    }

    // Store wallet address for Supabase RLS
    localStorage.setItem('wallet', getWalletAddress(wallet));

    if (!uploadedImageUrl || !selectedCoordinates) {
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
      const mintAddress = await mintNft(wallet, {
        name: title,
        description,
        imageUrl: uploadedImageUrl,
        x: selectedCoordinates.x,
        y: selectedCoordinates.y
      });

      const nftUrl = `https://solscan.io/token/${mintAddress}`;
      setNftUrl(nftUrl);

      const supabase = await getSupabase();
      
      // Verify Supabase headers
      const walletHeader = localStorage.getItem('wallet');
      if (!walletHeader) {
        throw new Error('Wallet-Header fehlt für Supabase');
      }

      const { error: dbError } = await supabase
        .from('pixels')
        .upsert({
          x: selectedCoordinates.x,
          y: selectedCoordinates.y,
          image_url: uploadedImageUrl,
          nft_url: nftUrl,
          owner: getWalletAddress(wallet)
        });

      if (dbError) throw dbError;

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
          wallet: wallet.publicKey?.toBase58() ?? 'undefined',
          error: error instanceof Error ? error.message : 'Unknown error'
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
  }, [uploadedImageUrl, selectedCoordinates, wallet, title, description, t, mintNft]);

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

        {connectionError && (
          <div className="p-2 mb-4 bg-red-500/10 text-red-500 rounded">
            {connectionError}
          </div>
        )}

        {isConnecting ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-300">Connecting wallet...</p>
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

            {selectedCoordinates && (
              <PixelForm
                coordinates={selectedCoordinates}
                onSuccess={handleUploadSuccess}
                onError={handleUploadError}
              />
            )}

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
              disabled={!uploadedImageUrl || loading || !title || !description || !selectedCoordinates}
              className={`w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2
                ${uploadedImageUrl && !loading && title && description && selectedCoordinates
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
        )}
      </div>
    </div>
  );
};

export default PixelModal;