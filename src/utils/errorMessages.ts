import { monitoring } from '../services/monitoring';

type ErrorCode = 
  | 'WALLET_NOT_CONNECTED'
  | 'INSUFFICIENT_BALANCE'
  | 'PIXEL_ALREADY_TAKEN'
  | 'UPLOAD_FAILED'
  | 'BACKEND_ERROR'
  | 'UNEXPECTED_ERROR'
  | 'SUPABASE_PIXEL_CHECK_FAILED'
  | 'INVALID_COORDINATES'
  | 'INVALID_IMAGE'
  | 'MINT_FAILED'
  | 'SUPABASE_NOT_INITIALIZED'
  | 'PUBLIC_URL_NOT_ACCESSIBLE'
  | 'INVALID_IMAGE_BYTES'
  | 'FILE_TOO_LARGE'
  | 'INVALID_PIXEL_DATA'
  | 'INVALID_RESPONSE_FORMAT'
  | 'NO_FREE_PIXELS';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  WALLET_NOT_CONNECTED: 'Please connect your wallet to continue',
  INSUFFICIENT_BALANCE: 'Insufficient balance. You need at least 1 SOL.',
  PIXEL_ALREADY_TAKEN: 'This pixel is already taken.',
  UPLOAD_FAILED: 'Failed to upload image.',
  BACKEND_ERROR: 'Server error - please try again later.',
  UNEXPECTED_ERROR: 'An unexpected error occurred.',
  SUPABASE_PIXEL_CHECK_FAILED: 'Failed to check pixel availability.',
  INVALID_COORDINATES: 'Invalid pixel coordinates.',
  INVALID_IMAGE: 'Invalid image format or file too large.',
  MINT_FAILED: 'Failed to mint NFT.',
  SUPABASE_NOT_INITIALIZED: 'Database connection failed.',
  PUBLIC_URL_NOT_ACCESSIBLE: 'Failed to verify uploaded image.',
  INVALID_IMAGE_BYTES: 'Invalid image format.',
  FILE_TOO_LARGE: 'File size must not exceed 10MB.',
  INVALID_PIXEL_DATA: 'Invalid pixel data.',
  INVALID_RESPONSE_FORMAT: 'Invalid response from server.',
  NO_FREE_PIXELS: 'No free pixels available.'
};

export function getErrorMessage(error: unknown): string {
  try {
    // Handle Error objects with code
    if (error instanceof Error) {
      const code = error.message as ErrorCode;
      if (code in ERROR_MESSAGES) {
        return ERROR_MESSAGES[code];
      }
      return error.message;
    }

    // Handle string error codes
    if (typeof error === 'string' && error in ERROR_MESSAGES) {
      return ERROR_MESSAGES[error as ErrorCode];
    }

    // Log unexpected errors
    monitoring.logError({
      error: error instanceof Error ? error : new Error('Unknown error type'),
      context: { 
        action: 'getErrorMessage',
        errorType: typeof error,
        errorValue: String(error)
      }
    });

    return ERROR_MESSAGES.UNEXPECTED_ERROR;
  } catch (err) {
    monitoring.logError({
      error: err instanceof Error ? err : new Error('Error in getErrorMessage'),
      context: { 
        action: 'getErrorMessage',
        originalError: error
      }
    });
    return ERROR_MESSAGES.UNEXPECTED_ERROR;
  }
}

export function isKnownError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message in ERROR_MESSAGES;
  }
  return typeof error === 'string' && error in ERROR_MESSAGES;
}

export const ERROR_CODES = Object.keys(ERROR_MESSAGES) as ErrorCode[];

export default {
  getErrorMessage,
  isKnownError,
  ERROR_CODES,
  ERROR_MESSAGES
};