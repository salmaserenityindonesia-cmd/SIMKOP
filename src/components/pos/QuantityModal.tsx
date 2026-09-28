import React, { useState, useEffect, useRef } from 'react';

export default function QuantityModal({ isOpen, item, onClose, onConfirm }) {
  const [qty, setQty] = useState(1);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQty(1);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (qty > 0) onConfirm(qty);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="bg-primary-container text-surface-container-lowest px-5 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed text-[22px]">format_list_numbered</span>
            <span className="font-title-md text-title-md">Kuantitas (Qty)</span>
          </div>
          <button className="text-surface-container-lowest/80 hover:text-surface-container-lowest" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 text-center">
          <div className="font-headline-sm text-headline-sm text-primary mt-0.5">{item.name}</div>
          <div className="my-6 flex items-center justify-center gap-3">
            <button className="w-14 h-14 rounded-xl border border-outline-variant hover:bg-surface-container font-headline-md text-primary flex items-center justify-center shadow-xs" onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
            <input 
              ref={inputRef}
              className="w-28 h-14 text-center font-mono font-extrabold text-[32px] border-2 border-secondary rounded-xl text-primary focus:outline-none focus:ring-4 focus:ring-secondary/20" 
              type="number" min="1" value={qty} 
              onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              onKeyDown={handleKeyDown}
            />
            <button className="w-14 h-14 rounded-xl border border-outline-variant hover:bg-surface-container font-headline-md text-primary flex items-center justify-center shadow-xs" onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-3 bg-surface-container text-primary font-title-sm rounded-lg hover:bg-surface-container-high transition-colors" onClick={onClose}>
              Batalkan [Esc]
            </button>
            <button className="flex-1 py-3 bg-secondary text-on-secondary font-title-sm rounded-lg hover:bg-secondary/90 transition-all shadow-sm" onClick={() => qty > 0 && onConfirm(qty)}>
              Simpan [Enter]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}