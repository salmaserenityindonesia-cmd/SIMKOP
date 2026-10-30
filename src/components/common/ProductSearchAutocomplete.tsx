import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

export interface ProductAutocompleteItem {
  id: string;
  sku: string;
  name: string;
  buy_price?: number;
  stock?: number;
  unit?: string;
}

export interface ProductSearchAutocompleteProps {
  products: ProductAutocompleteItem[];
  selectedProductId: string;
  onSelect: (product: ProductAutocompleteItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  defaultOpen?: boolean;
}

/**
 * Pure helper function to filter products by name or SKU
 * Case-insensitive match, limited to top results for optimal UI performance
 */
export function filterProducts(
  products: ProductAutocompleteItem[],
  searchTerm: string,
  limit: number = 20
): ProductAutocompleteItem[] {
  if (!searchTerm || !searchTerm.trim()) {
    return products.slice(0, limit);
  }

  const term = searchTerm.toLowerCase().trim();
  const matched = products.filter((p) => {
    const nameMatch = p.name ? p.name.toLowerCase().includes(term) : false;
    const skuMatch = p.sku ? p.sku.toLowerCase().includes(term) : false;
    return nameMatch || skuMatch;
  });

  return matched.slice(0, limit);
}

/**
 * Pure helper function to calculate keyboard navigation index
 */
export function calculateNextHighlightedIndex(
  currentIndex: number,
  totalItems: number,
  key: 'ArrowDown' | 'ArrowUp'
): number {
  if (totalItems <= 0) return -1;

  if (key === 'ArrowDown') {
    if (currentIndex < 0) return 0;
    return Math.min(currentIndex + 1, totalItems - 1);
  }

  if (key === 'ArrowUp') {
    if (currentIndex < 0) return totalItems - 1;
    return Math.max(currentIndex - 1, 0);
  }

  return currentIndex;
}

export const ProductSearchAutocomplete: React.FC<ProductSearchAutocompleteProps> = ({
  products,
  selectedProductId,
  onSelect,
  placeholder = 'Cari produk berdasarkan nama atau SKU/barcode...',
  autoFocus = false,
  disabled = false,
  className = '',
  defaultOpen = false,
}) => {
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const [searchTerm, setSearchTerm] = useState<string>(selectedProduct?.name || '');
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevSelectedIdRef = useRef<string>(selectedProductId);

  // Sync searchTerm when selectedProductId changes externally
  useEffect(() => {
    if (selectedProductId !== prevSelectedIdRef.current) {
      prevSelectedIdRef.current = selectedProductId;
      const matched = products.find((p) => p.id === selectedProductId);
      setSearchTerm(matched ? matched.name : '');
    }
  }, [selectedProductId, products]);

  // Click / touch outside listener to automatically close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const filtered = filterProducts(products, searchTerm);

  // Scroll highlighted item into view smoothly
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (item: ProductAutocompleteItem) => {
    onSelect(item);
    setSearchTerm(item.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    setSearchTerm('');
    setIsOpen(true);
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) => calculateNextHighlightedIndex(prev, filtered.length, 'ArrowDown'));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(Math.max(filtered.length - 1, 0));
      } else {
        setHighlightedIndex((prev) => calculateNextHighlightedIndex(prev, filtered.length, 'ArrowUp'));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        e.preventDefault();
        handleSelect(filtered[highlightedIndex]);
      } else if (isOpen && filtered.length === 1) {
        e.preventDefault();
        handleSelect(filtered[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-outline absolute left-3 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="product-autocomplete-list"
          aria-activedescendant={highlightedIndex >= 0 ? `product-option-${highlightedIndex}` : undefined}
          autoFocus={autoFocus}
          disabled={disabled}
          value={searchTerm}
          onChange={(e) => {
            if (disabled) return;
            setSearchTerm(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={(e) => {
            if (disabled) return;
            setIsOpen(true);
            e.target.select();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full pl-9 pr-8 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all ${
            disabled ? 'opacity-60 bg-slate-100 cursor-not-allowed select-none' : ''
          }`}
        />
        {searchTerm && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            tabIndex={-1}
            aria-label="Bersihkan pencarian"
            className="absolute right-2.5 p-1 text-on-surface-variant hover:text-on-surface rounded-full hover:bg-surface-container transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          id="product-autocomplete-list"
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl bg-surface border border-outline-variant/50 shadow-xl divide-y divide-outline-variant/20 animate-in fade-in-50 duration-100"
        >
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-on-surface-variant">
              Produk tidak ditemukan untuk kata kunci &ldquo;<span className="font-semibold text-on-surface">{searchTerm}</span>&rdquo;
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 bg-surface-container-low text-[11px] text-on-surface-variant flex justify-between items-center">
                <span>Menampilkan {filtered.length} produk</span>
                <span className="font-mono text-[10px]">Gunakan ↑ ↓ dan Enter</span>
              </div>
              {filtered.map((item, idx) => {
                const isHighlighted = idx === highlightedIndex;
                return (
                  <div
                    key={item.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    role="option"
                    id={`product-option-${idx}`}
                    aria-selected={isHighlighted}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2.5 px-3 cursor-pointer transition-colors flex flex-col gap-1 ${
                      isHighlighted
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-surface-container-high/60 text-on-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-on-surface line-clamp-1">{item.name}</span>
                      {item.buy_price !== undefined && (
                        <span className="font-mono text-xs font-semibold text-primary whitespace-nowrap">
                          Rp {item.buy_price.toLocaleString('id-ID')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-on-surface-variant">
                      <span className="font-mono bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30 text-[11px]">
                        {item.sku}
                      </span>
                      {item.stock !== undefined && (
                        <span className="text-secondary font-medium">
                          Stok: {item.stock} {item.unit || 'item'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductSearchAutocomplete;
