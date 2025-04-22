import React, { useState, useCallback } from 'react';
import { useWalletConnection } from '../../hooks/useWalletConnection';
import { getSupabase } from '../../lib/supabase';
import { validateFile } from '../../utils/validation';
import { monitoring } from '../../services/monitoring';
import { isWalletConnected, getWalletAddress } from '../../utils/walletUtils';
import { Upload } from 'lucide-react';

interface PixelFormProps {
  coordinates: { x: number; y: number };
  onSuccess: (imageUrl: string) => void;
  onError: (error: string) => void;
}

export const PixelForm: React.FC<PixelFormProps> = ({ coordinates, onSuccess, onError }) => {
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { wallet } = useWalletConnection();

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
      onError(error instanceof Error ? error.message : 'Invalid file');
      return false;
    }
  }, [previewUrl, onError]);

  const handleUpload = useCallback(async (file: File) => {
    if (!isWalletConnected(wallet)) {
      throw new Error('WALLET_NOT_CONNECTED');
    }

    try {
      validateFile(file);
      setUploading(true);

      // Check pixel availability first
      await validatePixelAvailability(coordinates.x, coordinates.y);

      if (!file.type.startsWith('image/')) {
        throw new Error('INVALID_IMAGE');
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (!fileExt) {
        throw new Error('INVALID_IMAGE');
      }

      const allowedExts = ['jpg', 'jpeg', 'png', 'gif'];
      if (!allowedExts.includes(fileExt)) {
        throw new Error('UNSUPPORTED_IMAGE_TYPE');
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
      }[fileExt] || 'image/jpeg';

      const cleanExt = fileExt.replace(/[^a-z0-9]/gi, '') || 'jpg';
      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${cleanExt}`;
      const correctedFile = new File([arrayBuffer], fileName, { type: mimeType });

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

      // Validate URL format
      const isValid = /^https:\/\/.*\/pixel-images\/.*\.(png|jpg|jpeg|gif)$/i.test(data.publicUrl);
      if (!isValid) {
        throw new Error('INVALID_IMAGE_URL_FORMAT');
      }

      // Pixel wird erst nach erfolgreichem Mint gespeichert
      onSuccess(data.publicUrl);
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
      onError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [coordinates, onSuccess, onError, wallet, validatePixelAvailability]);

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

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Upload Your Image
      </label>
      
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

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="ml-3 text-white">Uploading...</span>
          </div>
        )}
      </div>
    </div>
  );
};