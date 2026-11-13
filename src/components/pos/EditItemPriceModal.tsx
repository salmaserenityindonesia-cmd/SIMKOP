import React, { useState, useEffect, useRef } from 'react';
import { Tag, AlertTriangle, X, Check, Loader2 } from 'lucide-react';
import { updateProductSellPriceFromPos } from '../../services/productService';
import { useFeedback } from '../../context/FeedbackContext';

export interface EditItemPriceTarget {
  id: string;
  product_id?: string;
  name: string;
  sku?: string;
  barcode?: string;
  price: number;
  buy_price?: number;
  qty: number;
}

export interface EditItemPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: EditItemPriceTarget | null;
  currentUserId?: string;
  onSuccess: (productId: string, newPrice: number) => void;
}

export default function EditItemPriceModal({
  isOpen,
  onClose,
  item,
  currentUserId,
  onSuccess,
}: EditItemPriceModalProps) {
  const { showToast } = useFeedback();
  const [newPrice, setNewPrice] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && item) {
      setNewPrice(
        String(Math.max(0, Math.round(Number(item.price) || 0))).replace(/[^0-9]/g, '')
      );
      setErrorMsg(null);
      setIsSaving(false);
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, item]);

  useEffect(() => {
    if (!isOpen) return;
    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleModalKeyDown, true);
    return () => window.removeEventListener('keydown', handleModalKeyDown, true);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen || !item) return null;

  const numericNewPrice = Number(newPrice);
  const hasBuyPrice = typeof item.buy_price === 'number' && !Number.isNaN(item.buy_price);
  const isBelowCost =
    newPrice.trim() !== '' &&
    !Number.isNaN(numericNewPrice) &&
    numericNewPrice < Number(item.buy_price || 0);

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isSaving) return;

    if (newPrice.trim() === '' || Number.isNaN(numericNewPrice) || numericNewPrice < 0) {
      setErrorMsg('Masukkan harga jual baru yang valid (minimal Rp 0).');
      inputRef.current?.focus();
      return;
    }

    const parsedPrice = Math.max(0, Math.round(numericNewPrice || 0));
    const targetProductId = item.product_id || item.id;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      await updateProductSellPriceFromPos(
        targetProductId,
        parsedPrice,
        Number(item.price) || 0,
        currentUserId
      );
      onSuccess(targetProductId, parsedPrice);
      showToast(
        `Harga ${item.name} diperbarui menjadi Rp ${parsedPrice.toLocaleString('id-ID')}`,
        'success'
      );
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Gagal memperbarui harga jual produk.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === '.' || e.key === ',' || e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit(e);
    } else if (e.key === 'Escape' && !isSaving) {
      e.preventDefault();
      onClose();
    }
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const digitsOnly = pasted.replace(/[^0-9]/g, '');
    const input = e.currentTarget;
    const start = input.selectionStart ?? newPrice.length;
    const end = input.selectionEnd ?? newPrice.length;
    const nextValue = (newPrice.slice(0, start) + digitsOnly + newPrice.slice(end)).replace(/[^0-9]/g, '');
    setNewPrice(nextValue);
    if (errorMsg) setErrorMsg(null);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const cursorPos = start + digitsOnly.length;
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      <div
        className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-item-price-title"
      >
        <div className="bg-primary-container text-surface-container-lowest px-5 py-4 flex justify-between items-start gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-secondary-fixed/20 text-secondary-fixed flex items-center justify-center shrink-0 mt-0.5">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 id="edit-item-price-title" className="font-title-md text-title-md leading-snug">
                Edit Harga Jual Produk
              </h2>
              <p className="text-xs text-surface-container-lowest/80 mt-0.5">
                Perubahan langsung memperbarui harga di Master Inventori & Daftar Belanja
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSaving}
            aria-label="Tutup modal edit harga"
            className="text-surface-container-lowest/80 hover:text-surface-container-lowest cursor-pointer disabled:opacity-50"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Kartu Identitas Produk */}
          <div className="rounded-xl bg-surface-container-low border border-outline-variant/40 p-3.5 space-y-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
                Nama Produk
              </div>
              <div className="font-title-md text-title-md text-primary leading-snug">
                {item.name}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-outline-variant/30 text-xs">
              <div>
                <div className="text-on-surface-variant">SKU / Barcode</div>
                <div className="font-mono font-semibold text-primary mt-0.5 break-all">
                  {item.sku || item.barcode || '-'}
                </div>
              </div>
              <div>
                <div className="text-on-surface-variant">Harga Jual Lama</div>
                <div className="font-mono font-bold text-slate-700 mt-0.5">
                  Rp {Number(item.price || 0).toLocaleString('id-ID')}
                </div>
              </div>
              <div>
                <div className="text-on-surface-variant">Harga Beli / HPP</div>
                <div className="font-mono font-semibold text-slate-700 mt-0.5">
                  {hasBuyPrice ? `Rp ${Number(item.buy_price).toLocaleString('id-ID')}` : '-'}
                </div>
              </div>
            </div>
          </div>

          {/* Input Harga Jual Baru */}
          <div>
            <label
              htmlFor="edit-sell-price-input"
              className="block text-sm font-semibold text-primary mb-1.5"
            >
              Harga Jual Baru (Rp)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-sm font-mono font-bold text-on-surface-variant pointer-events-none">
                Rp
              </span>
              <input
                ref={inputRef}
                id="edit-sell-price-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                disabled={isSaving}
                value={newPrice}
                onChange={(e) => {
                  setNewPrice(e.target.value.replace(/[^0-9]/g, ''));
                  if (errorMsg) setErrorMsg(null);
                }}
                onPaste={handleInputPaste}
                onKeyDown={handleInputKeyDown}
                className="w-full pl-11 pr-4 py-3 text-right font-mono font-extrabold text-2xl border-2 border-secondary rounded-xl text-primary bg-surface focus:outline-none focus:ring-4 focus:ring-secondary/20 disabled:opacity-60"
                placeholder="0"
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-on-surface-variant">
              <span>Ketik angka bulat tanpa titik/koma</span>
              <span className="font-mono font-semibold text-primary">
                Rp {(newPrice ? Number(newPrice) : 0).toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Peringatan Amber jika di bawah Harga Beli (HPP) */}
          {isBelowCost && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">
                Perhatian: Harga jual baru lebih rendah dari Harga Beli (HPP).
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-error-container/30 border border-error/40 text-error text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              disabled={isSaving}
              className="flex-1 py-2.5 px-4 bg-surface-container text-primary font-title-sm rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50"
              onClick={onClose}
            >
              Batalkan [Esc]
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 px-4 bg-secondary text-on-secondary font-title-sm rounded-lg hover:bg-secondary/90 transition-all shadow-sm cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Simpan &amp; Update Harga</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
