## Current Position
- **Phase**: 39 (Unggah Logo Koperasi ke Cloudinary & Render Dinamis di Login)
- **Task**: All plans executed & verified
- **Status**: Complete — ready for /verify 39

## Last Session Summary
Phase 39 executed and verified:
- Plan 39.1: Migration 029 `029_add_logo_url_to_koperasi_profile.sql`, `cloudinaryService.ts` engine & update `settingsService.ts` (commits `ff6a7ffd`, `aef570c0`).
- Plan 39.2: Logo Uploader card di `PengaturanKoperasi.tsx` (preview, loading spinner, remove logo) & dynamic logo rendering di `LoginForm.tsx` (commits `b03f790e`, `accb5685`).
- Plan 39.3: Unit test suite `cloudinaryService.test.ts` & `settingsService.test.ts`, 21 files, 211 tests passed 100%, TypeScript typecheck passed, production build exit code 0 (commits `8c2160b9`, `0b98d478`).

## Next Steps
Verify Phase 39 using `/verify 39` or proceed to next milestone/phase.

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
