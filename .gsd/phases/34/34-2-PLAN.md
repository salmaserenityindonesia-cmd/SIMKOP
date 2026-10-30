---
phase: 34
plan: 2
wave: 2
gap_closure: false
---

# Plan 34.2: Wave 2 - Service Layer & Perhitungan Saldo Berjalan (Running Balance)

## Objective
Mengimplementasikan service layer `src/services/inventoryMutationService.ts` untuk mengelola penarikan data mutasi inventori dari view PostgreSQL `v_inventory_mutations`, memadukan metadata produk (SKU, nama, unit, stok terkini), menghitung saldo berjalan (running balance) dan saldo awal/akhir per produk, serta menghitung metrik agregat KPI mutasi. Dilengkapi dengan dual-layer fallback (mock in-memory/direct table aggregation) dan unit test komprehensif pada `src/services/inventoryMutationService.test.ts`.

## Context
Load these files for context:
- src/services/koperasiService.ts
- src/services/purchaseReturnService.ts
- src/services/retail-report.service.ts
- supabase/migrations/027_create_inventory_mutation_view.sql

## Tasks

<task type="auto">
  <name>Implement inventoryMutationService with Running Balance Calculation</name>
  <files>
    src/services/inventoryMutationService.ts
  </files>
  <action>
    Buat `src/services/inventoryMutationService.ts`:
    1. Ekspor interface TypeScript:
       - `MutationType`: `'KELUAR_PENJUALAN' | 'MASUK_PEMBELIAN' | 'KELUAR_RETUR' | 'MASUK_KLAIM_PENGGANTI'`
       - `InventoryMutation`:
         ```ts
         export interface InventoryMutation {
           mutation_id: string;
           mutation_date: string;
           product_id: string;
           mutation_type: MutationType;
           type_label: string;
           reference_number: string;
           qty_in: number;
           qty_out: number;
           unit_price: number;
           notes: string;
           product_name?: string;
           sku?: string;
           unit?: string;
           balance_after?: number;
         }
         ```
       - `MutationFilter`:
         ```ts
         export interface MutationFilter {
           startDate: string;
           endDate: string;
           productId?: string;
           mutationType?: string;
           search?: string;
         }
         ```
       - `MutationKPISummary`:
         ```ts
         export interface MutationKPISummary {
           totalMasuk: number;
           totalKeluar: number;
           netPerubahan: number;
           totalNilaiMasuk: number;
           totalNilaiKeluar: number;
           totalTransaksi: number;
         }
         ```
       - `ProductStockLedger`:
         ```ts
         export interface ProductStockLedger {
           productId: string;
           productName: string;
           sku: string;
           unit: string;
           currentStock: number;
           initialBalance: number;
           finalBalance: number;
           mutations: InventoryMutation[];
           kpi: MutationKPISummary;
         }
         ```
    2. Sediakan mock data in-memory dan setter/getter untuk offline resilience & Vitest:
       - `mockInventoryMutations`: array contoh mutasi penjualan, pembelian, retur, klaim pengganti.
       - `setMockInventoryMutations()` dan `getMockInventoryMutations()`.
    3. Implementasikan fungsi-fungsi utama:
       - `getInventoryMutations(filters: MutationFilter)`:
         * Query ke view `v_inventory_mutations` dengan range tanggal `mutation_date >= startDate 00:00:00` dan `<= endDate 23:59:59`.
         * Gabungkan dengan detail produk (`id, name, sku, unit, stock`).
         * Urutkan kronologis `mutation_date ASC`.
         * Terapkan filter opsional `productId`, `mutationType`, dan `search` (pencarian teks pada nomor referensi, nama produk, atau keterangan).
         * Hitung ringkasan `MutationKPISummary`: `totalMasuk`, `totalKeluar`, `netPerubahan = totalMasuk - totalKeluar`, `totalNilaiMasuk`, `totalNilaiKeluar`, `totalTransaksi`.
       - `getProductStockLedger(productId: string, startDate: string, endDate: string)`:
         * Ambil mutasi produk sebelum `startDate` untuk menghitung `initialBalance` (atau derivasi dari stok saat ini dikurangi seluruh mutasi setelah periode).
         * Ambil mutasi dalam periode rentang `startDate` s/d `endDate`.
         * Lakukan iterasi kronologis untuk menghitung `balance_after` pada setiap baris:
           `current = current + item.qty_in - item.qty_out; item.balance_after = current;`
         * Kembalikan objek `ProductStockLedger` lengkap dengan `initialBalance`, `finalBalance`, dan `kpi`.
       - `getAllProductsForFilter()`: Mengambil daftar produk singkat (`id, name, sku, stock`) untuk dropdown filter produk di UI.
  </action>
  <verify>
    npm run typecheck
  </verify>
  <done>
    File inventoryMutationService.ts terpasang dengan kalkulasi saldo berjalan, ringkasan KPI, dan fungsi kartu stok produk.
  </done>
</task>

<task type="auto">
  <name>Create Unit Tests for inventoryMutationService</name>
  <files>
    src/services/inventoryMutationService.test.ts
  </files>
  <action>
    Buat berkas pengujian `src/services/inventoryMutationService.test.ts` menggunakan Vitest:
    1. Pengujian `getInventoryMutations`:
       - Menghitung KPI `totalMasuk`, `totalKeluar`, `netPerubahan` dengan tepat.
       - Memfilter berdasarkan `mutationType` (misal hanya 'KELUAR_PENJUALAN' atau 'MASUK_PEMBELIAN').
       - Memfilter berdasarkan `productId`.
       - Menangani kasus tidak ada transaksi dalam rentang tanggal (empty state).
    2. Pengujian `getProductStockLedger`:
       - Menghitung running balance secara akurat: setiap baris memiliki `balance_after` yang sesuai dengan `qty_in` dan `qty_out`.
       - Memastikan `finalBalance = initialBalance + totalMasuk - totalKeluar`.
    3. Pengujian ketahanan error dan fallback in-memory.
  </action>
  <verify>
    npx vitest run src/services/inventoryMutationService.test.ts
  </verify>
  <done>
    Unit tests untuk inventoryMutationService lulus 100% dengan pengujian kalkulasi matematika saldo berjalan yang ketat.
  </done>
</task>

## Success Criteria
- [ ] Interface dan fungsi `inventoryMutationService.ts` terdefinisi lengkap
- [ ] Perhitungan running balance konsisten secara matematis
- [ ] Unit tests di `inventoryMutationService.test.ts` lulus tanpa kesalahan
- [ ] Tipe TypeScript valid tanpa kompilasi error

