# Phase 11: Comprehensive Member Migration

> Auto-generated based on user request (GSD Framework)

## Objective
Implementasi modul "Comprehensive Member Onboarding & Historical Balance Migration via Excel (.xlsx) with One-Time Principal Deposit".

## Business Rules
1. **Template 14 Kolom:** nrp, nama, pangkat, bank_account_number, membership_status, tgl_awal_anggota, jumlah_simpanan_pokok, jumlah_simpanan_wajib, jumlah_simpanan_belanja, jumlah_simpanan_lebaran, jumlah_pinjaman, tgl_awal_pinjaman, tenor, sisa_pinjaman.
2. **Simpanan Pokok:** 1 baris transaksi utuh (tidak dibagi bulan) pada tanggal `tgl_awal_anggota`.
3. **Simpanan Rutin:** Dibagi rata (`jumlah_simpanan / max(1, bulan terlewati)`), dibuat entri transaksi per bulan sejak `tgl_awal_anggota`.
4. **Pinjaman:**
   - Sisa pinjaman & tenor dihitung.
   - Angsuran lampau (`jumlah_pinjaman - sisa_pinjaman`) dibagi rata ke `loan_repayments` sejak `tgl_awal_pinjaman`.
   - Sisa angsuran dibuat jadwal aktif di `loan_schedules`.
5. **Stateless Processing:** File excel langsung dibaca dan diolah di client-side memory (SPA architecture), tidak ada temporary file di server.

## Architecture Adaptation (Client-Side Orchestration)
Karena aplikasi ini adalah Single Page Application (SPA) React + Supabase JS Client, eksekusi migrasi yang seharusnya di backend (`/api/...` dan `fs.promises.unlink`) diadaptasi menjadi **Service-Side Orchestration** di dalam `src/services/memberExcelService.ts`. Kita akan melakukan bulk insert / upsert secara paralel di browser menggunakan `exceljs` dan `@supabase/supabase-js`.

## Wave Execution Plan

### Wave 1: Template Generator & Migration Engine
- **Task:** Buat fungsi ekspor template 14 kolom dan fungsi parsing & kalkulasi.
- **Files:** `src/services/memberExcelService.ts`
- **Action:** 
  1. Modifikasi `exportMemberTemplate` dengan 14 kolom.
  2. Modifikasi `parseMemberUpload` untuk memvalidasi dan memproses 14 kolom.
  3. Kembalikan data kalkulasi pratinjau (Pokok, Rutin, Pinjaman) ke UI.

### Wave 2: Atomic-like Seeding & UI Integration
- **Task:** Eksekusi data ke Supabase dan integrasi UI.
- **Files:** `src/services/memberExcelService.ts`, `src/pages/admin/ManajemenAnggota.tsx`, `src/components/members/MemberMigrationModal.tsx`
- **Action:**
  1. Buat `executeMigration` di `memberExcelService.ts` yang melakukan bulk upsert `anggota`, bulk insert `member_deposits`, bulk insert `deposit_transactions`, bulk insert `loans`, `loan_repayments`, dan `loan_schedules`.
  2. Buat `MemberMigrationModal.tsx` untuk menampilkan pratinjau hasil parsing.
  3. Hubungkan tombol di `ManajemenAnggota.tsx` ke fitur baru ini.
