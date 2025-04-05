import React, { useCallback } from 'react';
import { Twitter, Facebook, Apple as WhatsApp, Link as LinkIcon } from 'lucide-react';
import type { PixelData } from '../types';
import { monitoring } from '../services/monitoring';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  pixel: PixelData | null;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, pixel }) => {
  if (!isOpen || !pixel) return null;

  const shareUrl = encodeURIComponent(`${window.location.origin}?x=${pixel.x}&y=${pixel.y}`);
  const text = encodeURIComponent("Check out my pixel in the Trump Legacy Mosaic!").replace(/%20/g, "+");
  
  const handleShare = useCallback(async (platform: 'twitter' | 'facebook' | 'whatsapp' | 'copy') => {
    try {
      switch (platform) {
        case 'twitter':
          window.open(`https://twitter.com/intent/tweet?url=${shareUrl}&text=${text}`, '_blank');
          break;
        case 'facebook':
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, '_blank');
          break;
        case 'whatsapp':
          window.open(`https://wa.me/?text=${text} ${shareUrl}`, '_blank');
          break;
        case 'copy':
          await navigator.clipboard.writeText(decodeURIComponent(shareUrl));
          break;
      }

      monitoring.logEvent('share_pixel', {
        platform,
        x: pixel.x,
        y: pixel.y
      });
    } catch (error) {
      monitoring.logError({
        error: `Failed to share on ${platform}`,
        context: { platform, pixel }
      });
    }
  }, [shareUrl, text, pixel]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50">
      <div className="bg-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-md m-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-serif font-bold">Trump Moment</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {pixel.imageUrl && (
            <div className="aspect-square rounded-lg overflow-hidden bg-gray-800">
              <img 
                src={pixel.imageUrl} 
                alt="Pixel content" 
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          
          <div>
            <p className="text-sm text-gray-400">Titel</p>
            <p className="text-lg font-medium">{pixel.title || "Untitled Trump Moment"}</p>
          </div>

          <div>
            <p className="text-sm text-gray-400">Dein Trump Moment</p>
            <p className="text-gray-200 mt-1">{pixel.description || "Keine Beschreibung vorhanden."}</p>
          </div>

          <div className="pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-400 mb-3">Teile diesen Moment</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleShare('twitter')}
                className="flex items-center justify-center gap-2 py-2 rounded-lg font-medium bg-[#1DA1F2] hover:bg-[#1a94e0] transition-colors"
                aria-label="Auf Twitter teilen"
              >
                <Twitter size={18} />
                Twitter
              </button>
              <button
                onClick={() => handleShare('facebook')}
                className="flex items-center justify-center gap-2 py-2 rounded-lg font-medium bg-[#4267B2] hover:bg-[#375694] transition-colors"
                aria-label="Auf Facebook teilen"
              >
                <Facebook size={18} />
                Facebook
              </button>
              <button
                onClick={() => handleShare('whatsapp')}
                className="flex items-center justify-center gap-2 py-2 rounded-lg font-medium bg-[#25D366] hover:bg-[#20bd5a] transition-colors"
                aria-label="Über WhatsApp teilen"
              >
                <WhatsApp size={18} />
                WhatsApp
              </button>
              <button
                onClick={() => handleShare('copy')}
                className="flex items-center justify-center gap-2 py-2 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 transition-colors"
                aria-label="Link kopieren"
              >
                <LinkIcon size={18} />
                Link kopieren
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};