import { useState, useEffect, useRef } from 'react';
import { Produk } from '../../services/koperasiService';

interface ProductSearchInputProps {
  products?: Produk[];
  onSelectProduct: (product: { barcode: string; name: string; unit: string; price: number; stock: number; id: string }) => void;
  onOpenCamera: () => void;
  searchRef: React.Ref<HTMLInputElement>;
}

export default function ProductSearchInput({ products = [], onSelectProduct, onOpenCamera, searchRef }: ProductSearchInputProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.length > 0 
    ? products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.includes(query))
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        handleSelect(filtered[activeIndex]);
      } else if (filtered.length === 1) {
        handleSelect(filtered[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (product: Produk) => {
    onSelectProduct({ 
      barcode: product.sku, 
      name: product.name, 
      unit: product.unit, 
      price: product.sell_price, 
      stock: product.stock, 
      id: product.id 
    });
    setQuery('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-3 shadow-sm relative" ref={containerRef}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-outline">
            <span className="material-symbols-outlined text-[24px]">barcode_scanner</span>
          </div>
          <input
            ref={searchRef}
            autoComplete="off"
            className="w-full pl-12 pr-28 py-3 bg-surface border border-outline-variant/80 rounded-lg text-title-md font-title-md text-primary placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all font-mono tracking-tight"
            placeholder="Scan Barcode EAN-13 atau Ketik SKU / Nama Produk (Tekan Ctrl+K / F2)..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); setActiveIndex(-1); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
            <span className="px-2 py-1 rounded bg-surface-container text-on-surface-variant text-[11px] font-mono border border-outline-variant/40">ENTER ↵</span>
          </div>
        </div>
        <button className="px-4 py-3 bg-surface-container-low hover:bg-surface-container text-primary font-title-sm border border-outline-variant/60 rounded-lg flex items-center justify-center gap-2 transition-colors shrink-0" onClick={onOpenCamera}>
          <span className="material-symbols-outlined text-secondary text-[20px]">photo_camera</span>
          <span>Scan Kamera</span>
        </button>
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute left-3 right-3 top-full mt-1.5 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl z-20 overflow-hidden divide-y divide-outline-variant/30">
          <div className="px-3.5 py-1.5 bg-surface-container-low flex justify-between items-center text-label-sm font-label-sm text-on-surface-variant">
            <span>Hasil Pencarian Cepat Produk (Gunakan Panah ↑ ↓ dan Enter)</span>
            <span className="font-mono text-secondary">{filtered.length} Produk</span>
          </div>
          {filtered.map((item, idx) => (
            <div 
              key={item.id}
              className={`p-3 cursor-pointer flex items-center justify-between transition-colors ${idx === activeIndex ? 'bg-surface-container-low' : 'hover:bg-surface-container-low/50'}`}
              onClick={() => handleSelect(item)}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-body-sm text-outline">{item.sku}</span>
                    <span className="font-title-sm text-title-sm text-on-surface">{item.name}</span>
                  </div>
                  <div className="text-body-sm text-outline">Satuan: {item.unit}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-title-md font-bold text-primary font-mono">Rp {item.sell_price?.toLocaleString('id-ID')}</div>
                <div className="text-label-sm text-secondary font-medium">Stok: {item.stock} {item.unit}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}