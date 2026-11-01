## Current Position
- **Phase**: 46 (Implementasi Opsi Tahun Dinamis Berdasarkan Tahun Pinjaman Belum Lunas Terlama pada Matriks Pinjaman)
- **Task**: Planning Complete (Plans 46.1, 46.2, 46.3 ready for execution)
- **Status**: Ready to Execute

## Last Session Summary
Phase 46 planning finalized:
- Plan 46.1: Wave 1 - Dynamic Year Range Resolver Service & Unit Testing (`src/services/loanMatrixService.ts` and `src/services/loanMatrixService.test.ts`).
- Plan 46.2: Wave 2 - Bind Dynamic Year Selector in `src/pages/admin/LoanMatrix.tsx`.
- Plan 46.3: Wave 3 - Component Testing, Static Verification & Production Build (`src/pages/admin/LoanMatrix.test.tsx` and full suite).

## Next Steps
Run `/execute 46` or proceed with execution of Plan 46.1.

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
