import React, { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "./WalletButton";
import { supabase } from "../lib/supabase";
import { solanaService } from "../services/solana";
import type { PixelData } from "../types";

interface PixelModalProps {
  isOpen: boolean;
  onClose: () => void;
  pixel: PixelData | null;
  setSelectedPixel: (pixel: PixelData | null) => void;
  fromButton: boolean;
}

const PixelModal: React.FC<PixelModalProps> = ({ isOpen, onClose, pixel, setSelectedPixel, fromButton }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connected, publicKey } = useWallet();

  // Sicherstellen, dass Pixel nicht null ist und gültige Koordinaten hat
  const safePixel = pixel && typeof pixel.x === 'number' && typeof pixel.y === 'number' 
    ? pixel 
    : { x: 0, y: 0, owner: "", imageUrl: "", nftUrl: "" };

  useEffect(() => {
    if (isOpen && connected) {
      setLoading(false);
      setError(null);

      if (fromButton && (!pixel?.x || !pixel?.y)) { 
        // Generiere gültige Koordinaten zwischen 0 und 999
        const randomPixel = { 
          x: Math.min(Math.floor(Math.random() * 1000), 999), 
          y: Math.min(Math.floor(Math.random() * 1000), 999), 
          imageUrl: null 
        };
        setSelectedPixel(randomPixel);
      }
    }
  }, [isOpen, connected, fromButton, pixel, setSelectedPixel]);

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setDescription("");
      setFile(null);
      setError(null);
    }
  }, [isOpen]);

  const validateFile = (file: File): string | null => {
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!file || !validTypes.includes(file.type)) {
      return "Bitte nur JPG, PNG oder GIF-Dateien hochladen.";
    }

    if (file.size === 0 || file.size > maxSize) {
      return "Dateigröße muss zwischen 1KB und 10MB liegen.";
    }

    return null;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setError(null);

    if (selectedFile) {
      const validationError = validateFile(selectedFile);
      if (validationError) {
        setError(validationError);
        setFile(null);
        event.target.value = "";
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Bitte wähle eine Datei aus.");
      return;
    }
    if (!publicKey) {
      setError("Bitte verbinde zuerst dein Wallet.");
      return;
    }
    if (!pixel) {
      setError("Kein Pixel ausgewählt. Bitte versuche es erneut.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const finalTitle = title.trim() || "Untitled Trump Moment";
      const finalDescription = description.trim() || "No description provided.";

      const paymentTxId = await solanaService.processPayment({ publicKey });

      const fileExt = file.name.split('.').pop();
      const fileName = `pixel_${safePixel.x}_${safePixel.y}.${fileExt}`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from("pixel-images")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (storageError) throw storageError;

      const { data: { publicUrl } } = supabase.storage.from("pixel-images").getPublicUrl(fileName);

      const nftAddress = await solanaService.mintNFT(
        { publicKey },
        finalTitle,
        finalDescription,
        publicUrl,
        safePixel.x,
        safePixel.y
      );

      const { error: dbError } = await supabase.from("pixels").upsert({
        x: safePixel.x,
        y: safePixel.y,
        image_url: publicUrl,
        nft_url: `https://solscan.io/token/${nftAddress}?cluster=devnet`,
        owner: publicKey.toString(),
        title: finalTitle,
        description: finalDescription,
      });

      if (dbError) throw dbError;

      setFile(null);
      setTitle("");
      setDescription("");
      onClose();
    } catch (error) {
      console.error("Error uploading file:", error);
      setError(error instanceof Error ? error.message : "Upload fehlgeschlagen");
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50">
      <div className="bg-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-md m-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-serif font-bold">
            {fromButton ? "Buy Your Pixel" : "Dein Trump Moment"}
          </h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        {!connected ? (
          <div className="text-center py-8">
            <p className="text-gray-300 mb-4">Bitte verbinde dein Wallet um fortzufahren.</p>
            {loading ? (
              <button 
                className="w-full py-3 rounded-lg bg-gray-700 text-gray-400 cursor-not-allowed"
                disabled
              >
                Verbinde...
              </button>
            ) : (
              <WalletButton />
            )}
          </div>
        ) : (
          <>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-gray-400 mb-2">Ausgewähltes Pixel</p>
                <p className="font-mono bg-gray-800 px-3 py-2 rounded">
                  ({safePixel.x}, {safePixel.y})
                </p>
              </div>
              
              <div>
                <label className="text-sm text-gray-400 block mb-2">Bild hochladen</label>
                <input 
                  type="file" 
                  onChange={handleFileChange} 
                  accept="image/jpeg,image/jpg,image/png,image/gif"
                  className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0 file:text-sm file:font-semibold
                    file:bg-red-500 file:text-white hover:file:bg-red-600"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximale Größe: 10MB. Erlaubte Formate: JPG, PNG, GIF
                </p>
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 text-red-500 rounded-lg">
                  {error}
                </div>
              )}

              <button 
                onClick={handleSubmit} 
                disabled={!file || loading}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors
                  ${!file || loading 
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                    : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verarbeite...
                  </span>
                ) : fromButton ? (
                  'Buy Now (1 SOL)'
                ) : (
                  'NFT erstellen (1 SOL)'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PixelModal;