## Current Position
- **Phase**: 44 (Implementasi Impor Pinjaman Migrasi, Jadwal Angsuran & Rekonsiliasi Sisa Hutang)
- **Task**: Planning complete (Plans 44.1, 44.2, 44.3 created)
- **Status**: Ready for execution (/execute 44)

## Last Session Summary
Phase 44 planned across 3 waves:
- Plan 44.1: Build Migration Loan Schedule Generator & Sanitizer (`src/utils/memberMigrationParser.ts`) and integrate into `memberExcelService.ts` and `MemberMigrationModal.tsx`.
- Plan 44.2: Atomic Clean Overwrite & Synchronization of Loans, Schedules, and Repayments into database (`executeMigration`) and UI feedback in `ManajemenAnggota.tsx`.
- Plan 44.3: Comprehensive unit tests in `memberMigrationParser.test.ts` and `memberExcelService.test.ts`, static typecheck (`tsc`), and production build verification (`npm run build`).

## Next Steps
1. /execute 44 — Execute all plans for Phase 44

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
