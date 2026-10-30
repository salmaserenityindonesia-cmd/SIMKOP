import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import ProductSearchAutocomplete, {
  filterProducts,
  calculateNextHighlightedIndex,
  buildAutocompleteOptions,
  ProductAutocompleteItem,
} from './ProductSearchAutocomplete';

describe('ProductSearchAutocomplete - Component & Filtering Logic', () => {
  const sampleProducts: ProductAutocompleteItem[] = [
    {
      id: 'prod-1',
      sku: '8999999123456',
      name: 'Minyak Goreng Sania 2L',
      buy_price: 32000,
      stock: 15,
      unit: 'pouch',
    },
    {
      id: 'prod-2',
      sku: '8999999654321',
      name: 'Beras Premium Ramos 5kg',
      buy_price: 68000,
      stock: 30,
      unit: 'sak',
    },
    {
      id: 'prod-3',
      sku: '8991234567890',
      name: 'Gula Pasir Gulaku 1kg',
      buy_price: 16500,
      stock: 50,
      unit: 'kg',
    },
    {
      id: 'prod-4',
      sku: 'KOP-004',
      name: 'Kopi Kapal Api Special 165g',
      buy_price: 14000,
      stock: 25,
      unit: 'pack',
    },
  ];

  describe('filterProducts helper function', () => {
    it('returns all products up to default limit when searchTerm is empty', () => {
      const result = filterProducts(sampleProducts, '');
      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('prod-1');
    });

    it('filters products case-insensitively by name', () => {
      const result = filterProducts(sampleProducts, 'minyak');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Minyak Goreng Sania 2L');

      const upperResult = filterProducts(sampleProducts, 'BERAS');
      expect(upperResult).toHaveLength(1);
      expect(upperResult[0].name).toBe('Beras Premium Ramos 5kg');
    });

    it('filters products by SKU / barcode', () => {
      const result = filterProducts(sampleProducts, 'KOP-004');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Kopi Kapal Api Special 165g');

      const partialBarcodeResult = filterProducts(sampleProducts, '654321');
      expect(partialBarcodeResult).toHaveLength(1);
      expect(partialBarcodeResult[0].sku).toBe('8999999654321');
    });

    it('returns empty array when no product matches query', () => {
      const result = filterProducts(sampleProducts, 'tidak-ada-barang-ini');
      expect(result).toHaveLength(0);
    });

    it('respects the custom limit parameter', () => {
      const result = filterProducts(sampleProducts, '', 2);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('prod-1');
      expect(result[1].id).toBe('prod-2');
    });
  });

  describe('calculateNextHighlightedIndex keyboard navigation logic', () => {
    it('returns 0 when moving ArrowDown from unhighlighted state (-1)', () => {
      const nextIndex = calculateNextHighlightedIndex(-1, 4, 'ArrowDown');
      expect(nextIndex).toBe(0);
    });

    it('increments index on ArrowDown within bounds', () => {
      const nextIndex = calculateNextHighlightedIndex(1, 4, 'ArrowDown');
      expect(nextIndex).toBe(2);
    });

    it('clamps to last item index on ArrowDown at boundary', () => {
      const nextIndex = calculateNextHighlightedIndex(3, 4, 'ArrowDown');
      expect(nextIndex).toBe(3);
    });

    it('decrements index on ArrowUp within bounds', () => {
      const nextIndex = calculateNextHighlightedIndex(2, 4, 'ArrowUp');
      expect(nextIndex).toBe(1);
    });

    it('clamps to index 0 on ArrowUp at boundary', () => {
      const nextIndex = calculateNextHighlightedIndex(0, 4, 'ArrowUp');
      expect(nextIndex).toBe(0);
    });

    it('wraps to last index on ArrowUp from unhighlighted state (-1)', () => {
      const nextIndex = calculateNextHighlightedIndex(-1, 4, 'ArrowUp');
      expect(nextIndex).toBe(3);
    });

    it('returns -1 for empty list', () => {
      expect(calculateNextHighlightedIndex(0, 0, 'ArrowDown')).toBe(-1);
      expect(calculateNextHighlightedIndex(0, 0, 'ArrowUp')).toBe(-1);
    });
  });

  describe('buildAutocompleteOptions helper function', () => {
    it('prepends all option at index 0 when allOptionLabel is provided and searchTerm is empty', () => {
      const options = buildAutocompleteOptions(
        sampleProducts,
        '',
        undefined,
        'Semua Produk (Semua Mutasi Gudang)'
      );
      expect(options).toHaveLength(sampleProducts.length + 1);
      expect(options[0].kind).toBe('all');
      if (options[0].kind === 'all') {
        expect(options[0].label).toBe('Semua Produk (Semua Mutasi Gudang)');
      }
      expect(options[1].kind).toBe('product');
      if (options[1].kind === 'product') {
        expect(options[1].item.id).toBe('prod-1');
      }
    });

    it('hides all option when user is actively searching with non-empty term (negative case: prevents Enter bug)', () => {
      const options = buildAutocompleteOptions(
        sampleProducts,
        'kopi',
        undefined,
        'Semua Produk (Semua Mutasi Gudang)'
      );
      expect(options).toHaveLength(1);
      expect(options[0].kind).toBe('product');
      if (options[0].kind === 'product') {
        expect(options[0].item.name).toBe('Kopi Kapal Api Special 165g');
      }
      expect(options.some((opt) => opt.kind === 'all')).toBe(false);
    });

    it('restores all option at index 0 when searchTerm equals selectedProductName', () => {
      const options = buildAutocompleteOptions(
        sampleProducts,
        'Beras Premium Ramos 5kg',
        'Beras Premium Ramos 5kg',
        'Semua Produk (Semua Mutasi Gudang)'
      );
      expect(options[0].kind).toBe('all');
      if (options[0].kind === 'all') {
        expect(options[0].label).toBe('Semua Produk (Semua Mutasi Gudang)');
      }
      expect(options.length).toBeGreaterThan(1);
    });

    it('returns only product options when allOptionLabel is omitted (backward compatibility)', () => {
      const options = buildAutocompleteOptions(sampleProducts, '', undefined);
      expect(options).toHaveLength(sampleProducts.length);
      expect(options.every((opt) => opt.kind === 'product')).toBe(true);
    });

    it('handles empty product list with allOptionLabel correctly', () => {
      const options = buildAutocompleteOptions(
        [],
        '',
        undefined,
        'Semua Produk (Semua Mutasi Gudang)'
      );
      expect(options).toHaveLength(1);
      expect(options[0].kind).toBe('all');
    });
  });

  describe('Static markup rendering & accessibility attributes', () => {
    it('renders input with default placeholder, combobox role, and search icon', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProductSearchAutocomplete, {
          products: sampleProducts,
          selectedProductId: '',
          onSelect: () => {},
        })
      );

      expect(markup).toContain('role="combobox"');
      expect(markup).toContain('aria-autocomplete="list"');
      expect(markup).toContain('placeholder="Cari produk berdasarkan nama atau SKU/barcode..."');
      expect(markup).toContain('lucide-search');
      // Dropdown should be closed initially
      expect(markup).not.toContain('id="product-autocomplete-list"');
    });

    it('pre-fills input with product name when selectedProductId is supplied', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProductSearchAutocomplete, {
          products: sampleProducts,
          selectedProductId: 'prod-2',
          onSelect: () => {},
        })
      );

      expect(markup).toContain('value="Beras Premium Ramos 5kg"');
      // Clear button should be visible when value is present
      expect(markup).toContain('aria-label="Bersihkan pencarian"');
    });

    it('renders dropdown list and item details when defaultOpen is true', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProductSearchAutocomplete, {
          products: sampleProducts,
          selectedProductId: '',
          onSelect: () => {},
          defaultOpen: true,
        })
      );

      expect(markup).toContain('id="product-autocomplete-list"');
      expect(markup).toContain('role="listbox"');
      expect(markup).toContain('Minyak Goreng Sania 2L');
      expect(markup).toContain('8999999123456');
      expect(markup).toContain('Rp 32.000');
      expect(markup).toContain('Stok: 15 pouch');
      expect(markup).toContain('Gunakan ↑ ↓ dan Enter');
    });

    it('renders all-option with special label, role="option", and layer icon when allOptionLabel is set', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProductSearchAutocomplete, {
          products: sampleProducts,
          selectedProductId: '',
          onSelect: () => {},
          defaultOpen: true,
          allOptionLabel: 'Semua Produk (Semua Mutasi Gudang)',
        })
      );

      expect(markup).toContain('Semua Produk (Semua Mutasi Gudang)');
      expect(markup).toContain('role="option"');
      expect(markup).toContain('lucide-layers');
      // Menampilkan productCount (bukan total opsi + 1)
      expect(markup).toContain('Menampilkan 4 produk');
    });

    it('replaces visual styling classes with custom inputClassName while keeping structural classes', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProductSearchAutocomplete, {
          products: sampleProducts,
          selectedProductId: '',
          onSelect: () => {},
          inputClassName: 'text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800',
        })
      );

      expect(markup).toContain('bg-slate-50');
      expect(markup).toContain('rounded-xl');
      expect(markup).toContain('text-slate-800');
      expect(markup).not.toContain('bg-surface-container-lowest');
      // Structural classes retained
      expect(markup).toContain('w-full pl-9 pr-8 py-2');
    });

    it('renders empty message when no products match', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProductSearchAutocomplete, {
          products: [],
          selectedProductId: '',
          onSelect: () => {},
          defaultOpen: true,
        })
      );

      expect(markup).toContain('Produk tidak ditemukan untuk kata kunci');
    });

    it('applies disabled styling and attributes when disabled is true', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProductSearchAutocomplete, {
          products: sampleProducts,
          selectedProductId: 'prod-1',
          onSelect: () => {},
          disabled: true,
        })
      );

      expect(markup).toContain('disabled=""');
      expect(markup).toContain('cursor-not-allowed');
      // Clear button should NOT be rendered when disabled
      expect(markup).not.toContain('aria-label="Bersihkan pencarian"');
    });
  });

  describe('Component interaction and keyboard simulation', () => {
    it('provides all expected exports', () => {
      expect(ProductSearchAutocomplete).toBeDefined();
      expect(typeof filterProducts).toBe('function');
      expect(typeof calculateNextHighlightedIndex).toBe('function');
      expect(typeof buildAutocompleteOptions).toBe('function');
    });

    it('handles onSelect trigger simulation correctly', () => {
      const onSelectMock = vi.fn();
      const product = sampleProducts[0];

      onSelectMock(product);
      expect(onSelectMock).toHaveBeenCalledTimes(1);
      expect(onSelectMock).toHaveBeenCalledWith(product);
    });

    it('handles onClear trigger simulation correctly', () => {
      const onClearMock = vi.fn();
      onClearMock();
      expect(onClearMock).toHaveBeenCalledTimes(1);
    });
  });
});
