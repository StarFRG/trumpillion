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
  name: z.string().refine(
    (name) => ['.jpg', '.jpeg', '.png', '.gif'].some(ext => name.toLowerCase().endsWith(ext)),
    'File must have a valid image extension (.jpg, .jpeg, .png, .gif)'
  )
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
  const getMimeTypeFromExtension = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      default:
        return '';
    }
  };

  const inferredType = file.type || getMimeTypeFromExtension(file.name);

  const validation = FileValidationSchema.safeParse({
    type: inferredType,
    size: file.size,
    name: file.name.toLowerCase()
  });

  if (!validation.success) {
    const errorMessage = validation.error.errors
      .map(err => err.message)
      .join(', ');
    throw new Error(errorMessage);
  }
};

export const validateImageUrl = (url: string): boolean => {
  try {
    return z.string()
      .url()
      .refine(u => u.startsWith('https://'), {
        message: 'URL must start with https://'
      })
      .safeParse(url)
      .success;
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
