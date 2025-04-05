// Backup der validation.ts
import { z } from 'zod';

// Pixel Validation Schema
export const PixelCoordinatesSchema = z.object({
  x: z.number().int().min(0).max(999),
  y: z.number().int().min(0).max(999),
});

export const PixelDataSchema = z.object({
  x: z.number().int().min(0).max(999),
  y: z.number().int().min(0).max(999),
  owner: z.string().optional(),
  imageUrl: z.string().url().startsWith('https://').optional(),
  nftUrl: z.string().url().optional(),
  title: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});

// File Validation Schema
export const FileValidationSchema = z.object({
  type: z.string().refine(
    (type) => ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(type),
    'Only JPG, PNG and GIF files are allowed'
  ),
  size: z.number()
    .min(1024, 'File must be at least 1KB')
    .max(10 * 1024 * 1024, 'File must not exceed 10MB'),
  name: z.string().endsWith(z.union(['.jpg', '.jpeg', '.png', '.gif']))
});

// Validation Functions
export const validatePixel = (data: unknown): boolean => {
  try {
    PixelDataSchema.parse(data);
    return true;
  } catch (error) {
    return false;
  }
};

export const validateFile = (file: File): void => {
  const validation = FileValidationSchema.safeParse({
    type: file.type,
    size: file.size,
    name: file.name.toLowerCase()
  });

  if (!validation.success) {
    throw new Error(validation.error.errors[0].message);
  }
};

export const validateImageUrl = (url: string): boolean => {
  try {
    return z.string().url().startsWith('https://').parse(url) !== undefined;
  } catch {
    return false;
  }
};

export const validateCoordinates = (x: number, y: number): boolean => {
  try {
    PixelCoordinatesSchema.parse({ x, y });
    return true;
  } catch {
    return false;
  }
};