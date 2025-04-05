import { useState, useCallback } from 'react';
import { monitoring } from '../services/monitoring';

interface UseModalProps {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
}

export const useModal = ({ onOpen, onClose, onError }: UseModalProps = {}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(() => {
    try {
      setIsOpen(true);
      setError(null);
      onOpen?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to open modal');
      setError(error.message);
      onError?.(error);
      monitoring.logError({ 
        error,
        context: { action: 'open_modal' }
      });
    }
  }, [onOpen, onError]);

  const close = useCallback(() => {
    try {
      setIsOpen(false);
      setError(null);
      setLoading(false);
      onClose?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to close modal');
      setError(error.message);
      onError?.(error);
      monitoring.logError({ 
        error,
        context: { action: 'close_modal' }
      });
    }
  }, [onClose, onError]);

  const setModalError = useCallback((error: string | Error) => {
    const errorMessage = error instanceof Error ? error.message : error;
    setError(errorMessage);
    onError?.(error instanceof Error ? error : new Error(error));
    monitoring.logError({ 
      error,
      context: { action: 'modal_error' }
    });
  }, [onError]);

  return {
    isOpen,
    loading,
    setLoading,
    error,
    setError: setModalError,
    open,
    close
  };
};