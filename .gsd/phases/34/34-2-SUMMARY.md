# Summary Plan 34.2: Wave 2 - Service Layer & Perhitungan Saldo Berjalan (Running Balance)

## Objective
Mengimplementasikan service layer `src/services/inventoryMutationService.ts` untuk mengelola penarikan data mutasi inventori dari view PostgreSQL `v_inventory_mutations`, memadukan metadata produk (SKU, nama, unit, stok terkini), menghitung saldo berjalan (running balance) dan saldo awal/akhir per produk, serta menghitung metrik agregat KPI mutasi. Dilengkapi dengan dual-layer fallback (mock in-memory) dan unit test komprehensif pada `src/services/inventoryMutationService.test.ts`.

## Tasks Completed
| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| Task 1 | Implement `inventoryMutationService` with Running Balance Calculation | Completed | `60671893` |
| Task 2 | Create Unit Tests for `inventoryMutationService` | Completed | `9b75f127` |

## Key Changes
1. **Service Layer `src/services/inventoryMutationService.ts`**:
   - Diekspor interface TypeScript: `MutationType`, `InventoryMutation`, `MutationFilter`, `MutationKPISummary`, `ProductStockLedger`, `ProductOption`.
   - Implementasi dual-layer fallback dengan state mock in-memory (`mockInventoryMutations`, `mockProducts`) serta getter/setter dan `resetInventoryMutationMockState()`.
   - Fungsi `getInventoryMutations(filters: MutationFilter)`:
     * Menarik data dari view `v_inventory_mutations` dengan range tanggal `startDate` s/d `endDate`.
     * Memperkaya entri dengan detail produk (`name, sku, unit, stock`).
     * Mendukung filter `productId`, `mutationType`, dan pencarian teks `search`.
     * Menghitung saldo berjalan sequential accumulation per entri.
     * Mengagregasi metrik KPI: `totalMasuk`, `totalKeluar`, `netPerubahan`, `totalNilaiMasuk`, `totalNilaiKeluar`, `totalTransaksi`.
   - Fungsi `getProductStockLedger(productId, startDate, endDate, initialBalanceOverride?)`:
     * Menghitung `initialBalance` dari mutasi sebelum tanggal filter awal (atau override jika disediakan).
     * Melakukan iterasi kronologis untuk menghitung `balance_after` pada setiap baris transaksi.
     * Memastikan hukum konsistensi akuntansi stok: `finalBalance = initialBalance + totalMasuk - totalKeluar`.
   - Fungsi `getAllProductsForFilter()`: Mengambil daftar produk ringkas untuk dropdown filter UI.
2. **Unit Tests `src/services/inventoryMutationService.test.ts`**:
   - 15 pengujian unit Vitest mencakup helper, KPI calculation, filtering, running balance ledger, empty state, mock store manipulation, dan error fallback handling saat database offline atau bermasalah.

## Verification
- `npm run typecheck`: TypeScript compilation passed without errors.
- `npx vitest run src/services/inventoryMutationService.test.ts`: 15 passed (100%).
- Git commits verified:
  * `60671893 feat(phase-34): implement inventoryMutationService with running balance calculation`
  * `9b75f127 test(phase-34): add comprehensive unit tests for inventoryMutationService`

## Deferred
- None.
