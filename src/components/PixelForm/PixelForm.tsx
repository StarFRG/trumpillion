import React, { useState, useCallback } from 'react';
import { useWalletConnection } from '../../hooks/useWalletConnection';
import { getSupabase } from '../../lib/supabase';
import { validateFile } from '../../utils/validation';
import { monitoring } from '../../services/monitoring';
import { getWalletAddress, isWalletConnected } from '../../utils/walletUtils';
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
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const { wallet } = useWalletConnection();

  const handleFileSelect = useCallback((file: File) => {
    try {
      validateFile(file);
      
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      
      const newPreviewUrl = URL.createObjectURL(file);
      setPreviewUrl(newPreviewUrl);
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Invalid file');
      return false;
    }
  }, [previewUrl, onError]);

  const handleUpload = useCallback(async (file: File) => {
    try {
      if (!isWalletConnected(wallet)) {
        throw new Error('Wallet ist nicht verbunden');
      }

      validateFile(file);
      setUploading(true);

      const supabase = await getSupabase();
      const fileExt = file.name.split('.').pop();
      const fileName = `pixel_${coordinates.x}_${coordinates.y}.${fileExt}`;

      const { data: storageData, error: storageError } = await supabase.storage
        .from('pixel-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (storageError) throw storageError;

      const { data, error: publicUrlError } = supabase.storage
        .from('pixel-images')
        .getPublicUrl(fileName);

      if (publicUrlError || !data?.publicUrl) {
        throw new Error('Public URL konnte nicht generiert werden');
      }

      const publicUrl = data.publicUrl;
      setUploadedUrl(publicUrl);
    } catch (error) {
      console.error('Upload failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Upload failed'),
        context: { 
          action: 'upload_pixel_image',
          coordinates,
          wallet: getWalletAddress(wallet)
        }
      });
      onError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [coordinates, onError, wallet]);

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
          </div>
        )}
      </div>

      {uploadedUrl && !uploading && (
        <>
          <button
            onClick={() => onSuccess(uploadedUrl)}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded mt-4"
          >
            Weiter zum Minting
          </button>
          <p className="text-sm text-green-400 mt-2 text-center">
            Upload erfolgreich! Jetzt kannst du deinen Moment minten.
          </p>
        </>
      )}
    </div>
  );
};