import React, { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletButton } from './WalletButton';
import { Upload, X } from 'lucide-react';
import { usePixelStore } from '../store/pixelStore';
import { supabase } from '../lib/supabase';
import { solanaService } from '../services/solana';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose }) => {
  const wallet = useWallet();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedPixel } = usePixelStore();

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
    
    const file = e.dataTransfer.files[0];
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    
    if (file && validTypes.includes(file.type)) {
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      setUploadedFile(file);
    } else {
      setError('Please upload only JPG, PNG or GIF files');
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    
    if (file) {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      
      if (!validTypes.includes(file.type)) {
        setError('Please upload only JPG, PNG or GIF files');
        e.target.value = '';
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        e.target.value = '';
        return;
      }
      setUploadedFile(file);
    }
  }, []);

  const handleCancel = async () => {
    if (uploadedImageUrl) {
      const fileName = uploadedImageUrl.split('/').pop();
      if (fileName) {
        await supabase.storage.from("nft-images").remove([fileName]);
        console.log("🚀 Uploaded image was deleted because user clicked 'Cancel'");
      }
    }
    setUploadedImageUrl(null);
    setUploadedFile(null);
    onClose();
  };

  const handleUpload = useCallback(async () => {
    if (!uploadedFile || !selectedPixel || !wallet.connected || !wallet.publicKey) return;

    setLoading(true);
    setError(null);

    try {
      // Check if pixel is already owned
      const { data: existingPixel, error: fetchError } = await supabase
        .from("pixels")
        .select("x, y")
        .eq("x", selectedPixel.x)
        .eq("y", selectedPixel.y)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        throw new Error("Error checking existing pixel");
      }

      if (existingPixel) {
        setError("This pixel is already owned. Please select another.");
        setLoading(false);
        return;
      }

      // Process payment first
      const paymentTxId = await solanaService.processPayment(wallet);
      console.log('Payment successful:', paymentTxId);

      // Upload image to Supabase
      const fileExt = uploadedFile.name.split('.').pop();
      const fileName = `pixel_${selectedPixel.x}_${selectedPixel.y}.${fileExt}`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, uploadedFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (storageError) throw storageError;

      const { data: { publicUrl } } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      setUploadedImageUrl(publicUrl);

      // Mint NFT
      const nftAddress = await solanaService.mintNFT(
        wallet,
        `Trumpillion Pixel (${selectedPixel.x}, ${selectedPixel.y})`,
        'A piece of the Trumpillion mosaic',
        publicUrl,
        selectedPixel.x,
        selectedPixel.y
      );

      // Update pixel in database
      const { error: dbError } = await supabase
        .from('pixels')
        .upsert({
          x: selectedPixel.x,
          y: selectedPixel.y,
          image_url: publicUrl,
          nft_url: `https://solscan.io/token/${nftAddress}?cluster=devnet`,
          owner: wallet.publicKey.toString()
        });

      if (dbError) throw dbError;

      setUploadSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 2000));
      onClose();
    } catch (err) {
      console.error('Upload failed:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
      
      if (uploadedImageUrl) {
        const fileName = uploadedImageUrl.split('/').pop();
        if (fileName) {
          await supabase.storage.from("nft-images").remove([fileName]);
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
          <h3 className="text-xl font-bold">Upload Image</h3>
          <button 
            onClick={handleCancel}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {!wallet.connected ? (
          <div className="text-center py-8">
            <p className="text-gray-300 mb-4">Connect your wallet to continue</p>
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
                accept="image/jpeg,image/jpg,image/png,image/gif"
                onChange={handleFileChange}
              />
              <Upload className="mx-auto mb-4 text-gray-400" size={32} />
              <p className="text-gray-300">
                {uploadedFile 
                  ? uploadedFile.name
                  : 'Drag and drop your image here, or click to browse'
                }
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Supports JPG, PNG and GIF • Max 10MB
              </p>
            </div>

            {selectedPixel && (
              <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-400">Selected Pixel</p>
                <p className="font-mono text-white">
                  ({selectedPixel.x}, {selectedPixel.y})
                </p>
                <p className="text-sm text-gray-400 mt-2">Price</p>
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
                  Processing...
                </>
              ) : uploadSuccess ? (
                'Success!'
              ) : (
                'Mint NFT (1 SOL)'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
};