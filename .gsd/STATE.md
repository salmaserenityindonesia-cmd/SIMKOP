## Current Position
- **Phase**: 41 (Refactor Aksi Anggota: Hapus Delete & Detail Migrasi)
- **Task**: All plans executed & verified
- **Status**: Complete — ready for /verify 41

## Last Session Summary
Phase 41 executed and verified:
- Plan 41.1: Removed delete button from `ManajemenAnggota.tsx` and added `Eye` icon button for initial migration detail (commit `aa5183cf`).
- Plan 41.2: Created `MemberMigrationDetailModal.tsx` displaying 14 migration columns (member info, initial savings breakdown, initial loan details) with graceful fallback and integrated it into `ManajemenAnggota.tsx` (commits `9455203e`, `1a11c5fe`).
- Plan 41.3: Added unit tests `ManajemenAnggota.test.tsx` and `MemberMigrationDetailModal.test.tsx`, full Vitest suite (25 test files, 236 tests passing 100%), TypeScript typecheck passed, and production build exit code 0 (commits `787c2d96`, `f38bf017`).

## Next Steps
Verify Phase 41 using `/verify 41` or proceed to next milestone/phase.

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
