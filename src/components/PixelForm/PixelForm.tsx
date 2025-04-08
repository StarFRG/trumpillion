import React, { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getSupabase } from '../../lib/supabase';
import { validateFile } from '../../utils/validation';
import { monitoring } from '../../services/monitoring';

interface PixelFormProps {
  coordinates: { x: number; y: number };
  onSuccess: (imageUrl: string) => void;
  onError: (error: string) => void;
}

export const PixelForm: React.FC<PixelFormProps> = ({ coordinates, onSuccess, onError }) => {
  const [uploading, setUploading] = useState(false);
  const wallet = useWallet();

  const handleUpload = useCallback(async (file: File) => {
    try {
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

      onSuccess(publicUrl);
    } catch (error) {
      console.error('Upload failed:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Upload failed'),
        context: { 
          action: 'upload_pixel_image',
          coordinates,
          wallet: wallet?.publicKey?.toString?.() ?? ''
        }
      });
      onError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [coordinates, onSuccess, onError, wallet?.publicKey]);

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
        disabled={uploading}
        className="hidden"
        id="pixel-upload"
      />
      <label
        htmlFor="pixel-upload"
        className={`block w-full p-4 text-center border-2 border-dashed rounded-lg cursor-pointer transition-colors
          ${uploading 
            ? 'bg-gray-100 border-gray-300 cursor-not-allowed' 
            : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
          }`}
      >
        {uploading ? (
          <span className="text-gray-500">Lädt hoch...</span>
        ) : (
          <span className="text-gray-700">Klicke zum Hochladen</span>
        )}
      </label>
    </div>
  );
};