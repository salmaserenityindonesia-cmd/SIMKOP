## Current Position
- **Phase**: 46 (Implementasi Opsi Tahun Dinamis Berdasarkan Tahun Pinjaman Belum Lunas Terlama pada Matriks Pinjaman)
- **Task**: Phase execution and verification complete
- **Status**: Complete & Verified (7/7 must-haves verified)

## Last Session Summary
Phase 46 executed and independently verified:
- Plan 46.1: Built `getLoanMatrixAvailableYears()` helper service query in `src/services/loanMatrixService.ts` to dynamically resolve start year from oldest active/approved loan and end year from latest schedule due date with safe fallback, plus 5 unit tests in `src/services/loanMatrixService.test.ts` (commits `8e8bdd6e`, `1969f219`).
- Plan 46.2: Connected `availableYears` dynamic state to `<select>` dropdown in `src/pages/admin/LoanMatrix.tsx` with automatic year selection adjustment when switching years (commit `07fd43ac`).
- Plan 46.3: Built comprehensive component test suite `src/pages/admin/LoanMatrix.test.tsx` (9 tests), full Vitest suite run (30 test files, 304 tests passing 100%), TypeScript typecheck (`tsc --noEmit`), and production build verification (`npm run build`) passing with exit code 0 (commits `4082bc1d`, `e7354030`).
- Independent verification passed 7/7 must-haves with report at `.gsd/phases/46/VERIFICATION.md`.

## Next Steps
Phase 46 is complete. Awaiting next user request or phase definition.

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
