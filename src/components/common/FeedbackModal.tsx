import React, { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle, Info, X } from 'lucide-react';

export interface FeedbackModalProps {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  type,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'primary',
  onConfirm,
  onCancel,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus confirm button when opened
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const defaultTitle = type === 'confirm' ? 'Konfirmasi Tindakan' : 'Informasi';
  const displayTitle = title || defaultTitle;
  const defaultConfirmText = type === 'confirm' ? 'Lanjutkan' : 'OK';
  const displayConfirmText = confirmText || defaultConfirmText;
  const displayCancelText = cancelText || 'Batal';

  const isDanger = variant === 'danger';

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        className="bg-surface rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-outline-variant/30 flex flex-col animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-5 border-b border-outline-variant/20 flex items-start gap-3 bg-surface-container-lowest">
          <div
            className={`p-2.5 rounded-full shrink-0 ${
              isDanger
                ? 'bg-red-100 text-red-600'
                : type === 'confirm'
                ? 'bg-blue-100 text-blue-600'
                : 'bg-emerald-100 text-emerald-600'
            }`}
          >
            {isDanger ? (
              <AlertTriangle className="w-5 h-5" />
            ) : type === 'confirm' ? (
              <HelpCircle className="w-5 h-5" />
            ) : (
              <Info className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <h3
              id="feedback-modal-title"
              className="text-base font-semibold text-on-surface leading-tight"
            >
              {displayTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0 cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm text-on-surface-variant whitespace-pre-line leading-relaxed">
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-outline-variant/20 flex items-center justify-end gap-3 bg-surface-container-lowest">
          {type === 'confirm' && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg border border-outline-variant/50 transition-colors cursor-pointer"
            >
              {displayCancelText}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-colors cursor-pointer ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {displayConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;
