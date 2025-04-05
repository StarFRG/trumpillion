import { z } from 'zod';

// Pixel Validierung
export const PixelCoordinatesSchema = z.object({
  x: z.number().int().min(0).max(999),
  y: z.number().int().min(0).max(999),
});

export const PixelDataSchema = z.object({
  x: z.number().int().min(0).max(999),
  y: z.number().int().min(0).max(999),
  owner: z.string().optional(),
  imageUrl: z.string().url().optional(),
  nftUrl: z.string().url().optional(),
  title: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});

// Datei-Validierung
export const FileValidationSchema = z.object({
  type: z.string().refine(
    (type) => ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(type),
    'Nur JPG, PNG und GIF Dateien sind erlaubt'
  ),
  size: z.number().min(1).max(10 * 1024 * 1024), // 10MB max
});

// Wallet-Validierung
export const WalletSchema = z.object({
  publicKey: z.string().min(32).max(44),
  connected: z.boolean(),
});

// NFT Metadata Validierung
export const NFTMetadataSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  image: z.string().url(),
  attributes: z.array(z.object({
    trait_type: z.string(),
    value: z.string()
  })),
});

// Validierungsfunktionen
export const validatePixelCoordinates = (x: number, y: number) => {
  try {
    return PixelCoordinatesSchema.parse({ x, y });
  } catch (error) {
    throw new Error('Ungültige Pixel-Koordinaten');
  }
};

export const validateFile = (file: File) => {
  try {
    return FileValidationSchema.parse({
      type: file.type,
      size: file.size,
    });
  } catch (error) {
    throw new Error('Ungültige Datei');
  }
};

export const validateNFTMetadata = (metadata: unknown) => {
  try {
    return NFTMetadataSchema.parse(metadata);
  } catch (error) {
    throw new Error('Ungültige NFT Metadata');
  }
};