## Current Position
- **Phase**: 43 (Penggantian Baki Penuh Tanpa Akumulasi)
- **Task**: All plans executed & verified
- **Status**: Complete — ready for /verify 43

## Last Session Summary
Phase 43 executed and verified:
- Plan 43.1: Strengthened `executeMigration` with multi-pattern `.or()` deletion of all prior migration transactions and inserted single definitive migration transaction records with standard description `'Saldo Awal Migrasi Sistem'` (commits `c3d06509`, `99fe901c`).
- Plan 43.2: Updated `MemberMigrationDetailModal.tsx` to extract the single definitive latest migration transaction per deposit type, preventing stale legacy accumulative balance displays (commits `ecf35d09`, `b5f5065c`).
- Plan 43.3: Comprehensive unit tests in `memberExcelService.test.ts` and `MemberMigrationDetailModal.test.tsx`, full Vitest suite (25 test files, 252 tests passing 100%), TypeScript typecheck passed, and production build exit code 0 (commits `ae190671`, `13063a10`).

## Next Steps
Verify Phase 43 using `/verify 43` or proceed to next milestone/phase.

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
