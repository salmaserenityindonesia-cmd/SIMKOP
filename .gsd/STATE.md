## Current Position
- **Phase**: 35 (Penyelarasan Tombol Export Excel & Cetak PDF Laporan Mutasi Barang)
- **Task**: Planning complete
- **Status**: Ready for execution

## Last Session Summary
Phase 34 completed and verified. Phase 35 planned: 2 plans created across 2 waves to align the action buttons (Refresh, Export Excel, Cetak PDF) into a symmetric horizontal flex row and verify static types & build integrity.
- Plan 35.1: Wave 1 - Refactor Header Action Buttons into Symmetric Flex Row (`src/pages/admin/LaporanMutasiBarang.tsx`).
- Plan 35.2: Wave 2 - Static Type Checking, Test Suite & Vite Build Integrity.

## Next Steps
1. /execute 35

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
