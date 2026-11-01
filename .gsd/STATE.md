## Current Position
- **Phase**: 49 (Implementasi Tombol Reset Data Anggota, Riwayat Simpanan, dan Pinjaman - Clean Slate Verification)
- **Task**: Planning complete
- **Status**: Ready for execution

## Last Session Summary
Phase 49 direncanakan secara lengkap:
- Plan 49.1: Pembuatan migrasi PostgreSQL RPC atomik `reset_members_and_financial_records` (`supabase/migrations/030_create_reset_members_and_finances_rpc.sql`) untuk membersihkan data master anggota, simpanan, dan pinjaman dengan perlindungan integritas referensial (FK) serta melepaskan relasi anggota di transaksi POS (`sales.member_id = NULL`). Integrasi service method `resetAllMembersData()` pada `src/services/memberService.ts` dan implementasi tombol "Reset Data" beserta modal dialog keamanan kata kunci `DangerConfirmModal` pada `src/pages/admin/ManajemenAnggota.tsx`.
- Plan 49.2: Pengujian unit `resetAllMembersData()` pada `src/services/memberService.test.ts`, pengujian komponen `src/components/common/DangerConfirmModal.test.tsx` dan `src/pages/admin/ManajemenAnggota.test.tsx`, serta verifikasi menyeluruh suite Vitest workspace, TypeScript static typecheck (`tsc --noEmit`), dan Vite production build (`npm run build`).

## Next Steps
1. `/execute 49` (atau jalankan Plan 49.1)

## Blockers
- None.

## Context Dump

### Decisions Made
- **Nomor Berkas Migrasi**: Menggunakan indeks `030_create_reset_members_and_finances_rpc.sql` karena berkas `028_add_receipt_paper_size_to_pos_settings.sql` dan `029_add_logo_url_to_koperasi_profile.sql` telah ada di direktori migrasi.
- **Integritas Referensial & Proteksi Transaksi Retail Toko**:
  1. Relasi anggota pada transaksi kasir ritel tidak dihapus, melainkan disetel menjadi `NULL` (`UPDATE public.sales SET member_id = NULL WHERE member_id IS NOT NULL`) agar omzet kasir dan riwayat pergeseran stok kasir POS tetap utuh.
  2. Urutan penghapusan mematuhi rantai foreign key: `loan_repayments` -> `loan_installments` -> `loan_schedules` -> `loans` -> `deposit_transactions` -> `member_deposits` -> `rekening_audit_logs` -> `member_clearance_logs` -> `anggota` -> `members`.
  3. Menggunakan pengecekan bersyarat (`information_schema.tables`) untuk tabel-tabel opsional/kondisional agar migrasi kebal error saat dijalankan di lingkungan Supabase lokal maupun staging/produksi.
- **Proteksi Konfirmasi Bahaya (Double Verification)**:
  - Tombol aksi "Reset Data" tidak mengeksekusi langsung, melainkan memunculkan `DangerConfirmModal` bertema rose/merah.
  - Admin/Kasir diwajibkan mengetik kata kunci teks persis `"HAPUS SEMUA DATA ANGGOTA"` agar tombol konfirmasi menjadi aktif.
