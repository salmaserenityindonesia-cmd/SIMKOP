## Current Position
- **Phase**: 39 (Unggah Logo Koperasi ke Cloudinary & Render Dinamis di Login)
- **Task**: Planning completed, ready for execution
- **Status**: 📋 Planned (Phase 39 Plans 39.1, 39.2, 39.3 generated)

## Last Session Summary
Phase 38 executed and verified:
- Plan 38.1: Migration 028 `028_add_receipt_paper_size_to_pos_settings.sql` & posSettingsService update.
- Plan 38.2: UI selector ukuran kertas (58mm vs 80mm) di `PengaturanKasir.tsx` & layout reaktif di `ReceiptModal.tsx`.
- Plan 38.3: Full Vitest suite (19 files, 199 tests passing) & production Vite build exit code 0.

## Next Steps
Execute Phase 39: Unggah Logo Koperasi ke Cloudinary & Render Dinamis di Login (`/execute 39`).

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Migrasi 027**: File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.
- **Resolusi Kolom Database Riil**: Pada PostgreSQL View `public.v_inventory_mutations`, tabel `sale_items` menggunakan kolom `qty` dan `price` (bukan `quantity` atau `unit_price`). Filter status penjualan menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
- **Kalkulasi Saldo Berjalan (Running Balance)**: Diurutkan secara kronologis (`mutation_date ASC`). Untuk kartu stok produk spesifik, saldo awal dihitung dari akumulasi mutasi sebelum tanggal filter awal ditambah saldo berjalan periode.
- **Ekspor Excel & PDF Landscape**: Mengikuti arsitektur `retailExporter.ts` menggunakan lazy-import `exceljs` dan `jspdf` Landscape A4 dengan plugin `jspdf-autotable`.
- **Pemisahan Alur Retur Supplier**: Pengeluaran fisik barang rusak dialirkan sebagai 'KELUAR_RETUR' (`qty_out`), sementara penerimaan fisik barang pengganti dari supplier untuk klaim yang telah diselesaikan dicatat sebagai 'MASUK_KLAIM_PENGGANTI' (`qty_in`).
