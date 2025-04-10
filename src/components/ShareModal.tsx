import React, { useEffect, useState } from 'react';
import { X, Twitter, Facebook, Share2 } from 'lucide-react';
import { PixelData } from '../types';
import { metaService } from '../services/meta';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  pixel: PixelData | null;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, pixel }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && pixel) {
      metaService.updateShareMetaTags({
        title: pixel.title || 'My Trump Moment',
        description: pixel.description || 'Check out my pixel in the Trumpillion mosaic!',
        imageUrl: pixel.imageUrl || '/mosaic.jpg',
        url: `${window.location.origin}/pixel/${pixel.x}/${pixel.y}`
      });
    }

    return () => {
      if (isOpen && pixel) {
        metaService.resetMetaTags();
      }
    };
  }, [isOpen, pixel]);

  if (!isOpen || !pixel) return null;

  const shareUrl = `${window.location.origin}/pixel/${pixel.x}/${pixel.y}`;
  const shareTitle = pixel.title || 'My Trump Moment';
  const shareText = pixel.description || 'Check out my pixel in the Trumpillion mosaic!';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = (platform: string) => {
    const urls = {
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`
    };

    window.open(urls[platform as keyof typeof urls], '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 rounded-xl shadow-xl p-6 w-[400px] max-w-[90vw] z-[60]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Share this moment</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-gray-800 rounded-lg">
            <img 
              src={pixel.imageUrl || ''} 
              alt="Pixel" 
              className="w-full h-48 object-cover rounded-lg mb-4"
            />
            <h4 className="font-medium text-lg">{shareTitle}</h4>
            <p className="text-gray-400 text-sm">{shareText}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleShare('twitter')}
              className="flex items-center justify-center gap-2 p-3 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] rounded-lg transition-colors"
            >
              <Twitter size={20} />
              Twitter
            </button>
            <button
              onClick={() => handleShare('facebook')}
              className="flex items-center justify-center gap-2 p-3 bg-[#4267B2]/10 hover:bg-[#4267B2]/20 text-[#4267B2] rounded-lg transition-colors"
            >
              <Facebook size={20} />
              Facebook
            </button>
          </div>

          <button
            onClick={() => handleShare('whatsapp')}
            className="w-full flex items-center justify-center gap-2 p-3 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] rounded-lg transition-colors"
          >
            <Share2 size={20} />
            WhatsApp
          </button>

          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Share2 size={20} />
            {copied ? 'Link copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
};

