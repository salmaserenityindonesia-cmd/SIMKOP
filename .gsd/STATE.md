## Current Position
- **Phase**: 43 (Penggantian Baki Penuh Tanpa Akumulasi)
- **Task**: Planning completed, ready for execution
- **Status**: 📋 Planned (Phase 43 Plans 43.1, 43.2, 43.3 generated)

## Last Session Summary
Phase 42 executed and verified:
- Plan 42.1: Robust `parseAmount` sanitization handling raw integers, Rupiah dot separators ("2.000.000"), and raw as-is numeric mapping in `memberExcelService.ts` (commits `298d40e4`, `1a71f636`).
- Plan 42.2: Idempotent Exact Replacement Overwrite in `executeMigration` ensuring old migration deposit transactions and loans are cleanly deleted before new records are inserted (commits `8919a295`, `1a5c4f76`).
- Plan 42.3: Comprehensive unit tests in `memberExcelService.test.ts` (21 tests), full Vitest suite (25 test files, 246 tests passing 100%), TypeScript typecheck passed, and production build exit code 0 (commits `731a0f71`, `71cc80d5`).

## Next Steps
Execute Phase 43: Pembetulan Logik Migrasi: Laksana Penggantian Baki Penuh (Exact Overwrite) Tanpa Akumulasi (`/execute 43`).

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
