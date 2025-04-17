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
  | 'MINT_FAILED';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  WALLET_NOT_CONNECTED: 'Bitte verbinde deine Wallet.',
  INSUFFICIENT_BALANCE: 'Dein Guthaben reicht nicht aus. Du brauchst mindestens 1 SOL.',
  PIXEL_ALREADY_TAKEN: 'Dieser Pixel wurde bereits vergeben.',
  UPLOAD_FAILED: 'Fehler beim Hochladen des Bildes.',
  BACKEND_ERROR: 'Serverfehler – bitte versuche es später erneut.',
  UNEXPECTED_ERROR: 'Ein unbekannter Fehler ist aufgetreten.',
  SUPABASE_PIXEL_CHECK_FAILED: 'Fehler bei der Pixel-Verfügbarkeitsprüfung.',
  INVALID_COORDINATES: 'Ungültige Pixel-Koordinaten.',
  INVALID_IMAGE: 'Ungültiges Bildformat oder zu große Datei.',
  MINT_FAILED: 'NFT konnte nicht erstellt werden.'
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