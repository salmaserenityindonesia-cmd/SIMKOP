## Current Position
- **Phase**: 45 (Implementasi Ekspor Excel & PDF 14 Kolom Komprehensif pada Manajemen Anggota)
- **Task**: Planning complete (Plans 45.1, 45.2, 45.3, 45.4 created)
- **Status**: Ready for execution (/execute 45)

## Last Session Summary
Phase 45 planned across 4 waves:
- Plan 45.1: Build `getMembersComprehensiveReport()` data fetcher in `src/services/memberService.ts` aggregating member identity, 4 savings categories, and active loan balances.
- Plan 45.2: Implement `exportMembersToExcel()` (14 columns matching migration schema) and `exportMembersToPdf()` (landscape A4 with cooperative profile and totals) in `src/services/memberExporter.ts`.
- Plan 45.3: Connect toolbar Excel & PDF buttons in `src/pages/admin/ManajemenAnggota.tsx` with visual loading spinners and toast notifications.
- Plan 45.4: Comprehensive unit tests in `memberService.test.ts`, `memberExporter.test.ts`, and `ManajemenAnggota.test.tsx`, static type check (`tsc --noEmit`), and production build verification (`npm run build`).

## Next Steps
1. /execute 45 — Execute all plans for Phase 45

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
