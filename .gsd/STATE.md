## Current Position
- **Phase**: 35 (Penyelarasan Tombol Export Excel & Cetak PDF Laporan Mutasi Barang)
- **Task**: All tasks complete & verified
- **Status**: Verified

## Last Session Summary
Phase 35 executed and independently verified successfully. 2 plans, 2 tasks completed with 5/5 must-haves passing.
- Plan 35.1: Refactor Header Action Buttons into Symmetric Flex Row (`src/pages/admin/LaporanMutasiBarang.tsx`) with uniform `h-10`, `rounded-lg`, `gap-2.5`, and `shrink-0` layout (commit `05db6068`).
- Plan 35.2: Static type check (`tsc --noEmit`), full test suite verification (18 test files, 177 tests passing 100%), and production bundler build (`npm run build`) exit code 0 (commit `c7f6a16c`).
- Verification: Independent audit confirmed all 5 must-haves verified (5/5 PASS), 0 failures.

## Next Steps
All phases in current roadmap completed. Ready for next milestone or phase planning.

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
