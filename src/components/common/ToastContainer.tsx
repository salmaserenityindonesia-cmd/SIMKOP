import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastItemProps {
  toast: ToastItem;
  onClose: (id: string) => void;
}

const ToastMessage: React.FC<ToastItemProps> = ({ toast, onClose }) => {
  useEffect(() => {
    const duration = toast.duration ?? 4000;
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onClose]);

  const typeConfig = {
    success: {
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    },
    error: {
      icon: <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />,
      bg: 'bg-red-50 border-red-200 text-red-900',
    },
    warning: {
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
      bg: 'bg-amber-50 border-amber-200 text-amber-900',
    },
    info: {
      icon: <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />,
      bg: 'bg-blue-50 border-blue-200 text-blue-900',
    },
  };

  const config = typeConfig[toast.type] || typeConfig.info;

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-3 w-full p-4 rounded-xl border shadow-lg backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-2 fade-in ${config.bg}`}
    >
      {config.icon}
      <div className="flex-1 text-sm font-medium whitespace-pre-line leading-relaxed">
        {toast.message}
      </div>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors shrink-0 -mr-1 -mt-1 cursor-pointer"
        aria-label="Tutup pemberitahuan"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastItem[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => (
        <ToastMessage key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
};

export default ToastContainer;
