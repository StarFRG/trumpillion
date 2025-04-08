import React, { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletButton } from './WalletButton';
import { Upload, X } from 'lucide-react';
import { usePixelStore } from '../store/pixelStore';
import { getSupabase } from '../lib/supabase';
import { solanaService } from '../services/solana';
import { monitoring } from '../services/monitoring';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
const maxFileSize = 10 * 1024 * 1024; // 10MB

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose }) => {
  const wallet = useWallet();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedPixel } = usePixelStore();

  const validateFile = (file: File): boolean => {
    if (!file) {
      setError('Keine Datei ausgewählt');
      return false;
    }

    if (!validTypes.includes(file.type)) {
      setError('Bitte nur JPG, PNG oder GIF-Dateien hochladen');
      return false;
    }

    if (file.size > maxFileSize) {
      setError('Dateigröße darf maximal 10MB betragen');
      return false;
    }

    if (file.size === 0) {
      setError('Die Datei ist leer');
      return false;
    }

    return true;
  };

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
    setError(null);
    
    const file = e.dataTransfer?.files?.[0];
    if (!file) {
      setError('Keine Datei erkannt');
      return;
    }

    if (validateFile(file)) {
      setUploadedFile(file);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    
    if (!file) {
      setError('Bitte wähle eine Datei aus');
      return;
    }

    if (validateFile(file)) {
      setUploadedFile(file);
      e.target.value = ''; // Reset input for future uploads
    }
  }, []);

  const handleCancel = async () => {
    if (uploadedImageUrl) {
      const fileName = uploadedImageUrl.split('/').pop();
      if (fileName) {
        try {
          const supabase = await getSupabase();
          await supabase.storage.from('pixel-images').remove([fileName]);
        } catch (error) {
          monitoring.logError({
            error: error instanceof Error ? error : new Error('Failed to remove uploaded image'),
            context: { action: 'cancel_upload', fileName }
          });
        }
      }
    }
    setUploadedImageUrl(null);
    setUploadedFile(null);
    setError(null);
    onClose();
  };

  const handleUpload = useCallback(async () => {
    if (!wallet?.connected || !wallet?.publicKey) {
      setError('Bitte verbinde dein Wallet');
      return;
    }

    if (!uploadedFile || !selectedPixel) {
      setError('Bitte wähle ein Bild aus');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = await getSupabase();
      
      const { data: existingPixel, error: fetchError } = await supabase
        .from('pixels')
        .select('x, y')
        .eq('x', selectedPixel.x)
        .eq('y', selectedPixel.y)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw new Error('Fehler beim Prüfen des Pixels');
      }

      if (existingPixel) {
        setError('Dieses Pixel ist bereits vergeben. Bitte wähle ein anderes.');
        return;
      }

      const paymentTxId = await solanaService.processPayment(wallet);

      const fileExt = uploadedFile.name.split('.').pop();
      const fileName = `pixel_${selectedPixel.x}_${selectedPixel.y}.${fileExt}`;
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
        `Trumpillion Pixel (${selectedPixel.x}, ${selectedPixel.y})`,
        'A piece of the Trumpillion mosaic',
        publicUrl,
        selectedPixel.x,
        selectedPixel.y
      );

      const { error: dbError } = await supabase
        .from('pixels')
        .upsert({
          x: selectedPixel.x,
          y: selectedPixel.y,
          image_url: publicUrl,
          nft_url: `https://solscan.io/token/${nftAddress}?cluster=devnet`,
          owner: wallet?.publicKey?.toString?.() ?? ''
        });

      if (dbError) throw dbError;

      setUploadSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 2000));
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Upload failed'),
        context: { 
          action: 'upload_pixel',
          coordinates: selectedPixel,
          wallet: wallet?.publicKey?.toString?.() ?? ''
        }
      });
      setError(error instanceof Error ? error.message : 'Upload failed');
      
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
  }, [uploadedFile, selectedPixel, wallet, onClose, uploadedImageUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />
      <div className="relative bg-gray-900 rounded-xl shadow-xl p-6 w-[400px] max-w-[90vw] z-[60]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Bild hochladen</h3>
          <button 
            onClick={handleCancel}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {!wallet?.connected ? (
          <div className="text-center py-8">
            <p className="text-gray-300 mb-4">Verbinde dein Wallet um fortzufahren</p>
            <WalletButton />
          </div>
        ) : (
          <>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-6
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
                accept={validTypes.join(',')}
                onChange={handleFileChange}
              />
              <Upload className="mx-auto mb-4 text-gray-400" size={32} />
              <p className="text-gray-300">
                {uploadedFile 
                  ? uploadedFile.name
                  : 'Ziehe dein Bild hierher oder klicke zum Auswählen'
                }
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Unterstützt JPG, PNG und GIF • Max 10MB
              </p>
            </div>

            {selectedPixel && (
              <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-400">Ausgewähltes Pixel</p>
                <p className="font-mono text-white">
                  ({selectedPixel.x}, {selectedPixel.y})
                </p>
                <p className="text-sm text-gray-400 mt-2">Preis</p>
                <p className="font-mono text-white">1 SOL</p>
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-500">
                {error}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!uploadedFile || loading}
              className={`w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2
                ${uploadedFile && !loading
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Verarbeite...
                </>
              ) : uploadSuccess ? (
                'Erfolgreich!'
              ) : (
                'NFT erstellen (1 SOL)'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default UploadModal;