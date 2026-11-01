## Current Position
- **Phase**: 41 (Refactor Aksi Anggota: Hapus Delete & Detail Migrasi)
- **Task**: Planning completed, ready for execution
- **Status**: 📋 Planned (Phase 41 Plans 41.1, 41.2, 41.3 generated)

## Last Session Summary
Phase 40 executed and verified:
- Plan 40.1: Refactor `memberExcelService.ts` to pure as-is mapping (raw `jumlah_simpanan_wajib`, raw `tgl_awal_pinjaman` string/number, one-time lump-sum initial deposit transactions) (commits `962e024a`, `e345c411`).
- Plan 40.2: Expanded `MemberMigrationModal.tsx` to wide layout (`max-w-6xl`) with 12 columns, horizontal scroll, pure rupiah currency formatting, and raw Excel column displays (commits `b3fc6453`, `c90c84c0`).
- Plan 40.3: Comprehensive unit testing in `memberExcelService.test.ts` (11 tests), full Vitest suite (23 test files, 227 tests passing 100%), TypeScript typecheck passed, and production build exit code 0 (commits `50d67e1d`, `02dada56`).

## Next Steps
Execute Phase 41: Refactor Aksi Manajemen Anggota: Hapus Tombol Delete & Tambahkan Modal Detail Migrasi Awal (`/execute 41`).

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
