# Phase 36 Plan 1 Summary: Autocomplete Produk Berbasis Keyboard pada Filter Mode Kartu Stok

## Status
- **Status**: checkpoint
- **Tasks Completed**: 2 / 3
- **Commits**:
  - `9f61e2c9`: feat(phase-36): extend ProductSearchAutocomplete with all-option and onClear
  - `023b49f6`: feat(phase-36): replace mode kartu stok select with ProductSearchAutocomplete in LaporanMutasiBarang
- **Checkpoint**: Manual UI check at `/admin/laporan-mutasi` pending user verification.

---

## Changes Implemented

### Task 1: Extend `ProductSearchAutocomplete` (Backward-Compatible)
- **File**: `src/components/common/ProductSearchAutocomplete.tsx`
  - Added optional props: `allOptionLabel?: string`, `onClear?: () => void`, `inputClassName?: string`.
  - Exported pure helper `buildAutocompleteOptions` and type `AutocompleteOption`:
    - Prepends `{ kind: 'all', label: allOptionLabel }` when `allOptionLabel` is defined and user is not actively typing a query (`!searchTerm.trim() || searchTerm === selectedProductName`).
    - Hides the "all" option when actively searching with query text (prevents Enter key from mistakenly picking "Semua Produk" instead of the top search match).
  - Implemented keyboard navigation over `options` (ArrowDown/ArrowUp/Enter/Escape).
  - Implemented text restoration on `Escape` and outside click (`mousedown`/`touchstart`) using `selectedProductNameRef` without triggering unexpected filter mutations.
  - Added `commitClear()` handler when `onClear` prop is provided or 'X' button is clicked.
  - Rendered `all` option with `Layers` icon, `role="option"`, and active `Check` icon when `selectedProductId === ''`.
  - Added `inputClassName` support to allow overriding visual styling while retaining core structural layout classes (`w-full pl-9 pr-8 py-2 outline-none transition-all`).
  - Preserved complete backward-compatibility for existing consumers (`ManajemenPembelian.tsx` and `InputReturPembelian.tsx`).
- **File**: `src/components/common/ProductSearchAutocomplete.test.tsx`
  - Added 8 new unit tests covering `buildAutocompleteOptions`, negative active-search behavior, `allOptionLabel` rendering, `inputClassName` override, and mock callbacks.
  - Total tests increased from 19 to 27 tests (100% pass).

### Task 2: Replace Mode Kartu Stok Select in `LaporanMutasiBarang.tsx`
- **File**: `src/pages/admin/LaporanMutasiBarang.tsx`
  - Imported `ProductSearchAutocomplete` and `ProductAutocompleteItem`.
  - Added `autocompleteProducts` memo mapping `productsList` to `ProductAutocompleteItem[]` with fallback `sku: p.sku || '-'`.
  - Replaced `<select value={selectedProductId} ...>` with `<ProductSearchAutocomplete>` configured with:
    - `selectedProductId={selectedProductId === 'all' ? '' : selectedProductId}`
    - `onSelect={(p) => setSelectedProductId(p.id)}`
    - `onClear={() => setSelectedProductId('all')}`
    - `allOptionLabel="Semua Produk (Semua Mutasi Gudang)"`
    - `placeholder="Ketik Nama Produk atau Barcode / SKU..."`
    - `inputClassName="text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white"`
  - Maintained existing grid layout (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`) and automatic reactivity via `fetchData` effect hook.

---

## Verification Evidence

1. **Vitest Unit Tests**:
   - Command: `npx vitest run src/components/common/ProductSearchAutocomplete.test.tsx`
   - Result: 27/27 tests passed in 305ms.
   - Command: `npx vitest run` (Full test suite)
   - Result: 18 test files, 185 tests passed.

2. **TypeScript Static Analysis**:
   - Command: `npx tsc --noEmit`
   - Result: Exit code 0, 0 type errors.

3. **Pattern Verification**:
   - `Select-String -Path src/pages/admin/LaporanMutasiBarang.tsx -Pattern "ProductSearchAutocomplete","Semua Produk \(Semua Mutasi Gudang\)"`: Found imported and rendered.
   - `(Select-String -Path src/pages/admin/LaporanMutasiBarang.tsx -Pattern "value=\{selectedProductId\}").Count`: Output `0` (legacy `<select>` completely removed).

---

## Checkpoint: Human Verification (Task 3 Pending)
To manually verify:
1. Run `npm run dev` and navigate to `/admin/laporan-mutasi`.
2. Click on "Mode Kartu Stok (Produk)" input -> dropdown opens with "Semua Produk (Semua Mutasi Gudang)" at the top.
3. Type a query (e.g. "POSH" or barcode) -> list filters, all-option disappears, first product is highlighted.
4. Use ArrowDown/ArrowUp and press Enter -> product selected, stock card appears, data reloads.
5. Type text and press Escape -> dropdown closes, text reverts to selected product name without changing active filter.
6. Click `X` button -> filter resets to "Semua Produk (Semua Mutasi Gudang)", stock card hides, full mutation list displays.
