import React, { useState, useEffect, useRef } from 'react';
import { CartItem } from '../../pages/pos/index';

export interface QuantityModalProps {
  isOpen: boolean;
  item: Omit<CartItem, 'qty'> | CartItem | null;
  onClose: () => void;
  onConfirm: (qty: number) => void;
  mode?: 'add' | 'edit';
}

export default function QuantityModal({ isOpen, item, onClose, onConfirm, mode = 'add' }: QuantityModalProps) {
  const [qty, setQty] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const initialQty =
        item && 'qty' in item && typeof item.qty === 'number' && item.qty > 0
          ? item.qty
          : 1;
      setQty(initialQty);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleConfirm = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const parsedQty = Math.max(1, parseInt(String(qty), 10) || 1);
    if (parsedQty > 0) {
      onConfirm(parsedQty);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleConfirm(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="bg-primary-container text-surface-container-lowest px-5 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed text-[22px]">format_list_numbered</span>
            <span className="font-title-md text-title-md">
              {mode === 'edit' ? 'Ubah Kuantitas (Qty)' : 'Kuantitas (Qty)'}
            </span>
          </div>
          <button
            type="button"
            className="text-surface-container-lowest/80 hover:text-surface-container-lowest cursor-pointer"
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleConfirm} className="p-6 text-center">
          <div className="font-headline-sm text-headline-sm text-primary mt-0.5">{item.name}</div>
          <div className="my-6 flex items-center justify-center gap-3">
            <button
              type="button"
              className="w-14 h-14 rounded-xl border border-outline-variant hover:bg-surface-container font-headline-md text-primary flex items-center justify-center shadow-xs cursor-pointer active:scale-95 transition-all"
              onClick={() => setQty((prev) => Math.max(1, prev - 1))}
            >
              -
            </button>
            <input
              ref={inputRef}
              className="w-28 h-14 text-center font-mono font-extrabold text-[32px] border-2 border-secondary rounded-xl text-primary focus:outline-none focus:ring-4 focus:ring-secondary/20"
              type="number"
              min="1"
              value={qty || ''}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setQty(isNaN(val) ? 0 : val);
              }}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className="w-14 h-14 rounded-xl border border-outline-variant hover:bg-surface-container font-headline-md text-primary flex items-center justify-center shadow-xs cursor-pointer active:scale-95 transition-all"
              onClick={() => setQty((prev) => prev + 1)}
            >
              +
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 py-3 bg-surface-container text-primary font-title-sm rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer"
              onClick={onClose}
            >
              Batalkan [Esc]
            </button>
            <button
              type="button"
              className="flex-1 py-3 bg-secondary text-on-secondary font-title-sm rounded-lg hover:bg-secondary/90 transition-all shadow-sm cursor-pointer"
              onClick={handleConfirm}
            >
              Simpan [Enter]
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
