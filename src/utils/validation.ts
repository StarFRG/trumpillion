import { z } from 'zod';

// Pixel Validation Schema
export const PixelCoordinatesSchema = z.object({
  x: z.number().int().min(0).max(999),
  y: z.number().int().min(0).max(999),
});

export const PixelDataSchema = z.object({
  x: z.number().int().min(0).max(999),
  y: z.number().int().min(0).max(999),
  owner: z.string().min(1), // owner is required
  imageUrl: z.string()
    .url()
    .regex(/^https:\/\/.*\/pixel-images\/.*\.(png|jpg|jpeg|gif)$/i, 'Invalid image URL format'),
  nftUrl: z.string().url().optional(),
  title: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});

// File Validation Schema
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'] as const;
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'] as const;

export const FileValidationSchema = z.object({
  type: z.enum(ALLOWED_FILE_TYPES, {
    errorMap: () => ({ message: 'Only JPG, PNG and GIF files are allowed' })
  }),
  size: z.number()
    .min(1024, 'File must be at least 1KB')
    .max(MAX_FILE_SIZE, 'File must not exceed 10MB'),
  name: z.string().refine(
    (name) => ALLOWED_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext)),
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
  // Validate basic file properties
  const validation = FileValidationSchema.safeParse({
    type: file.type,
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
      .regex(/^https:\/\/.*\/pixel-images\/.*\.(png|jpg|jpeg|gif)$/i, 'Invalid image URL format')
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

export const validateMimeType = (fileType: string): boolean => {
  return ALLOWED_FILE_TYPES.includes(fileType as any);
};

export const validateFileExtension = (filename: string): boolean => {
  return ALLOWED_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
};

export const getMimeTypeFromExtension = (filename: string): string => {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif'
  } as const;

  return mimeTypes[ext as keyof typeof mimeTypes] || '';
};

export const validateMagicBytes = (buffer: ArrayBuffer): boolean => {
  const header = new Uint8Array(buffer.slice(0, 4));
  
  // PNG: 89 50 4E 47
  const isPNG = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
  
  // JPEG: FF D8
  const isJPEG = header[0] === 0xFF && header[1] === 0xD8;
  
  // GIF: 47 49 46
  const isGIF = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;

  return isPNG || isJPEG || isGIF;
};

export const validateFileSize = (size: number): boolean => {
  return size >= 1024 && size <= MAX_FILE_SIZE;
};

export const cleanFileName = (fileName: string): string => {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '') + (ext ? `.${ext}` : '');
};