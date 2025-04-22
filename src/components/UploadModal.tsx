import React, { useCallback, useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePixelStore } from '../store/pixelStore';
import { getSupabase } from '../lib/supabase';
import { monitoring } from '../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../utils/walletUtils';
import { validateFile } from '../utils/validation';
import { X, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getErrorMessage } from '../utils/errorMessages';
import { WalletValidationService } from '../services/wallet';
import { solanaService } from '../services/solana';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalStep = 'initial' | 'confirmed';

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose }) => {
  const wallet = useWallet();
  const { selectedPixel, findAvailablePixel } = usePixelStore();
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coordinates, setCoordinates] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [step, setStep] = useState<ModalStep>('initial');
  const [processingPayment, setProcessingPayment] = useState(false);

  const validateWallet = async () => {
    if (!isWalletConnected(wallet)) {
      throw new Error('WALLET_NOT_CONNECTED');
    }
    return WalletValidationService.validateWallet(wallet);
  };

  const validateBalance = async () => {
    if (!wallet) return false;
    return WalletValidationService.validateBalance(wallet, 1_000_000_000);
  };

  const checkPixelAvailability = async (x: number, y: number) => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('pixels')
        .select('owner')
        .eq('x', x)
        .eq('y', y)
        .maybeSingle();

      if (error) {
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

  const handlePrecheck = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!uploadedImageUrl) {
        throw new Error('INVALID_IMAGE');
      }

      if (!title || !description) {
        throw new Error('INVALID_INPUT');
      }

      if (!coordinates) {
        throw new Error('INVALID_COORDINATES');
      }

      const walletOk = await validateWallet();
      if (!walletOk) {
        throw new Error('WALLET_NOT_CONNECTED');
      }

      const balanceOk = await validateBalance();
      if (!balanceOk) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const pixelFree = await checkPixelAvailability(coordinates.x, coordinates.y);
      if (!pixelFree) {
        throw new Error('PIXEL_ALREADY_TAKEN');
      }

      setStep('confirmed');
    } catch (error) {
      const message = getErrorMessage(error);
      setError(message);
      toast.error(message);
      
      monitoring.logErrorWithContext(error, 'UploadModal:handlePrecheck', {
        coordinates,
        wallet: getWalletAddress(wallet)
      });
    } finally {
      setLoading(false);
    }
  };

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
        throw new Error('INVALID_IMAGE');
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

    if (!coordinates) {
      throw new Error('INVALID_COORDINATES');
      return;
    }

    try {
      validateFile(file);
      setLoading(true);
      setError(null);

      // Check pixel availability first
      const pixelFree = await checkPixelAvailability(coordinates.x, coordinates.y);
      if (!pixelFree) {
        throw new Error('PIXEL_ALREADY_TAKEN');
      }

      if (!file.type.startsWith('image/')) {
        throw new Error('INVALID_IMAGE');
      }

      const fileExt = file.name.split('.').pop();
      if (!fileExt) {
        throw new Error('INVALID_IMAGE');
      }

      const cleanExt = fileExt.replace(/[^a-z0-9]/gi, '') || 'jpg';
      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${cleanExt}`;

      const arrayBuffer = await file.arrayBuffer();
      const fileExt2 = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif'
      }[fileExt2] || 'image/jpeg';

      const correctedFile = new File([arrayBuffer], file.name, { type: mimeType });

      const supabase = await getSupabase();

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

      const { data } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (!data?.publicUrl) {
        throw new Error('UPLOAD_FAILED');
      }

      // Pixel wird erst nach erfolgreichem Mint gespeichert

      setUploadedImageUrl(data.publicUrl);
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
      setLoading(false);
    }
  }, [coordinates, wallet]);

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
      throw new Error('WALLET_NOT_CONNECTED');
    }

    if (!wallet.publicKey) {
      throw new Error('WALLET_NOT_CONNECTED');
    }

    if (!uploadedImageUrl || !coordinates) {
      throw new Error('INVALID_IMAGE');
    }

    if (!title || !description) {
      throw new Error('INVALID_INPUT');
    }

    if (loading || processingPayment) return;

    setLoading(true);
    setProcessingPayment(true);
    setError(null);

    try {
      // Check pixel availability one last time before proceeding
      const pixelFree = await checkPixelAvailability(coordinates.x, coordinates.y);
      if (!pixelFree) {
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
          imageUrl: uploadedImageUrl,
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
          image_url: uploadedImageUrl,
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

      setUploadSuccess(true);
      toast.success('NFT erfolgreich erstellt!');
      setTimeout(() => {
        handleCancel();
      }, 2000);
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
    } finally {
      setLoading(false);
      setProcessingPayment(false);
    }
  }, [uploadedImageUrl, coordinates, wallet, title, description, handleCancel, loading, processingPayment]);

  useEffect(() => {
    if (isOpen && !coordinates) {
      const initCoordinates = async () => {
        try {
          if (selectedPixel) {
            const pixelFree = await checkPixelAvailability(selectedPixel.x, selectedPixel.y);
            if (!pixelFree) {
              throw new Error('PIXEL_ALREADY_TAKEN');
            }
            setCoordinates(selectedPixel);
          } else {
            const availablePixel = await findAvailablePixel();
            if (availablePixel) {
              const pixelFree = await checkPixelAvailability(availablePixel.x, availablePixel.y);
              if (!pixelFree) {
                throw new Error('PIXEL_ALREADY_TAKEN');
              }
              setCoordinates(availablePixel);
            } else {
              setError('Leider sind aktuell keine freien Pixel verfügbar.');
              toast.error('Keine freien Pixel verfügbar.');
              onClose();
              return;
            }
          }
        } catch (error) {
          monitoring.logErrorWithContext(error, 'UploadModal:initCoordinates', {
            selectedPixel,
            wallet: getWalletAddress(wallet)
          });
          setError(getErrorMessage(error));
          toast.error(getErrorMessage(error));
        }
      };

      initCoordinates();
    }
  }, [isOpen, coordinates, selectedPixel, findAvailablePixel, wallet, onClose]);

  if (!isOpen) return null;

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
              Verbinde dein Wallet um fortzufahren
            </p>
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

            {coordinates && (
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-400">Your Pixel Location</p>
                <p className="font-mono text-white">
                  ({coordinates.x}, {coordinates.y})
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

            {step === 'initial' && (
              <button
                onClick={handlePrecheck}
                disabled={loading || !uploadedImageUrl || !title || !description || !coordinates}
                className={`w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2
                  ${uploadedImageUrl && !loading && title && description && coordinates
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  }`}
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Prüfe Voraussetzungen...
                  </>
                ) : (
                  'Weiter zur Vorschau'
                )}
              </button>
            )}

            {step === 'confirmed' && (
              <button
                onClick={handleMint}
                disabled={loading || processingPayment}
                className="w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
              >
                {loading || processingPayment ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    {processingPayment ? 'Verarbeite Zahlung...' : 'Erstelle NFT...'}
                  </>
                ) : uploadSuccess ? (
                  'Success! Your moment is now part of history!'
                ) : (
                  'Mint Your Trump Moment (1 SOL)'
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadModal;