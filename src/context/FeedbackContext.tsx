import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ToastContainer, { ToastItem, ToastType } from '../components/common/ToastContainer';
import FeedbackModal from '../components/common/FeedbackModal';

export type { ToastType, ToastItem };

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

export interface FeedbackContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
  showAlert: (message: string, title?: string) => Promise<void>;
}

const FeedbackContext = createContext<FeedbackContextType | null>(null);

interface ModalState {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    type: 'confirm',
    message: '',
  });

  const resolverRef = useRef<((value: any) => void) | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => [...prev, { id, message, type, duration }]);
    },
    []
  );

  const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    if (resolverRef.current) {
      resolverRef.current(false);
    }
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setModalState({
        isOpen: true,
        type: 'confirm',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        variant: options.variant || 'primary',
      });
    });
  }, []);

  const showAlert = useCallback((message: string, title?: string): Promise<void> => {
    if (resolverRef.current) {
      resolverRef.current(undefined);
    }
    return new Promise<void>((resolve) => {
      resolverRef.current = resolve;
      setModalState({
        isOpen: true,
        type: 'alert',
        title,
        message,
        confirmText: 'OK',
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setModalState((prev) => ({ ...prev, isOpen: false }));
    if (resolve) {
      resolve(true);
    }
  }, []);

  const handleCancel = useCallback(() => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setModalState((prev) => ({ ...prev, isOpen: false }));
    if (resolve) {
      resolve(false);
    }
  }, []);

  return (
    <FeedbackContext.Provider value={{ showToast, showConfirm, showAlert }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <FeedbackModal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        variant={modalState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </FeedbackContext.Provider>
  );
};

export const useFeedback = (): FeedbackContextType => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
};

export default FeedbackContext;
