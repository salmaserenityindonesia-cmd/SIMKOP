import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export interface DangerConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmationKeyword: string;
  confirmButtonLabel?: string;
  isLoading?: boolean;
  initialKeyword?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function isConfirmationKeywordMatched(input: string, keyword: string): boolean {
  return input.trim() === keyword.trim();
}

export function handleDangerConfirmSubmit(
  input: string,
  keyword: string,
  isLoading: boolean,
  onConfirm: () => void | Promise<void>
): boolean {
  if (isConfirmationKeywordMatched(input, keyword) && !isLoading) {
    onConfirm();
    return true;
  }
  return false;
}

export const DangerConfirmModal: React.FC<DangerConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmationKeyword,
  confirmButtonLabel = 'Ya, Kosongkan Sekarang',
  isLoading = false,
  initialKeyword = '',
  onConfirm,
  onClose,
}) => {
  const [inputKeyword, setInputKeyword] = useState(initialKeyword);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset input keyword whenever the modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setInputKeyword(initialKeyword);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setInputKeyword('');
    }
  }, [isOpen, initialKeyword]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const isKeywordMatched = isConfirmationKeywordMatched(inputKeyword, confirmationKeyword);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleDangerConfirmSubmit(inputKeyword, confirmationKeyword, isLoading, onConfirm);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="danger-modal-title"
        className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-rose-200 flex flex-col animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-5 border-b border-rose-100 flex items-start gap-3 bg-rose-50/70">
          <div className="p-2.5 rounded-full shrink-0 bg-rose-100 text-rose-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <h3
              id="danger-modal-title"
              className="text-base font-bold text-rose-900 leading-tight"
            >
              {title}
            </h3>
            <p className="text-xs text-rose-600 mt-0.5">
              Tindakan ini permanen dan tidak dapat dibatalkan
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
              {message}
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 space-y-2">
              <label htmlFor="confirmation-input" className="block text-xs font-medium text-rose-900">
                Ketik teks konfirmasi berikut untuk melanjutkan:
              </label>
              <div className="font-mono text-xs font-semibold text-rose-800 bg-white/80 px-2.5 py-1.5 rounded border border-rose-200 select-all">
                {confirmationKeyword}
              </div>
              <input
                id="confirmation-input"
                ref={inputRef}
                type="text"
                autoComplete="off"
                disabled={isLoading}
                value={inputKeyword}
                onChange={(e) => setInputKeyword(e.target.value)}
                placeholder={`Ketik "${confirmationKeyword}"`}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-white"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 px-6 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!isKeywordMatched || isLoading}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  <span>Memproses...</span>
                </>
              ) : (
                <span>{confirmButtonLabel}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DangerConfirmModal;
