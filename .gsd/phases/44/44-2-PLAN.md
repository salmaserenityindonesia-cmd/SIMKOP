---
phase: 44
plan: 2
wave: 2
depends_on: ["44.1"]
gap_closure: false
---

# Plan 44.2: Atomic Loan Database Insertion with Idempotency

## Objective
Mengimplementasikan penyimpanan data pinjaman migrasi ke Supabase secara atomik dan idempoten (Exact Overwrite): memperbarui `bank_account_number` pada `anggota`, membersihkan seluruh pinjaman migrasi lama milik anggota beserta relasi jadwal (`loan_schedules`) dan mutasi cicilannya (`loan_repayments`), menyisipkan pinjaman baru ke `loans`, menyisipkan baris jadwal angsuran ke `loan_schedules`, serta mencatat riwayat pembayaran lampau ke `loan_repayments` untuk jadwal berstatus `paid` / `partial`.

## Context
- `src/services/memberExcelService.ts` (`executeMigration`)
- `src/services/loanService.ts`
- `src/pages/admin/ManajemenAnggota.tsx`

## Tasks

<task type="auto">
  <name>Implement Clean Overwrite & Loan Synchronization in executeMigration</name>
  <files>
    src/services/memberExcelService.ts
  </files>
  <action>
    1. Buka `src/services/memberExcelService.ts`:
    2. Pada fungsi `executeMigration`:
       - Pastikan `bank_account_number` selalu di-upsert ke tabel `public.anggota`.
       - Ambil `loan_type_id` default dari tabel `public.loan_types` (`.eq('is_active', true).limit(1)`).
       - Ketika memproses data baris yang memiliki `jumlah_pinjaman > 0`:
         * **Step 1: Clean Overwrite (Idempotency)**:
           Cari apakah anggota telah memiliki pinjaman migrasi di `public.loans` (berdasarkan filter `member_id = memberId` dan `loan_number` diawali `'PINJ-MIGRASI-'` atau `'LOAN-MIG-'` atau `notes` memuat `'Migrasi'` / `'MIGRASI'`):
           - Ambil array ID pinjaman migrasi lama (`migLoanIds`).
           - Jika `migLoanIds.length > 0`:
             1. Hapus record pembayaran lampau di `public.loan_repayments` dengan filter `.in('loan_id', migLoanIds)`.
             2. Hapus record jadwal di `public.loan_schedules` dengan filter `.in('loan_id', migLoanIds)`.
             3. Hapus record pinjaman di `public.loans` dengan filter `.in('id', migLoanIds)`.
         * **Step 2: Generate Schedules**:
           Gunakan helper `generateMigrationLoanSchedules(row.jumlah_pinjaman, row.tenor, row.sisa_pinjaman, row.tgl_awal_pinjaman)`.
           Hitung `monthlyInstallment = Math.round(row.jumlah_pinjaman / (row.tenor > 0 ? row.tenor : 1))`.
         * **Step 3: Insert Loan Record**:
           Insert record baru ke `public.loans`:
           ```typescript
           const loanPayload = {
             loan_number: `PINJ-MIGRASI-${row.nrp}`,
             member_id: memberId,
             loan_type_id: loanTypeId,
             principal_amount: row.jumlah_pinjaman,
             amount: row.jumlah_pinjaman,
             agreed_tenor_months: row.tenor,
             tenor: row.tenor,
             planned_installment_amount: monthlyInstallment,
             monthly_target: monthlyInstallment,
             disbursed_at: validDisbursedDate.toISOString(),
             status: row.sisa_pinjaman <= 0 ? 'completed' : 'active',
             notes: `Migrasi Pinjaman Awal (Sisa: Rp ${row.sisa_pinjaman})`
           };
           ```
         * **Step 4: Insert Schedules & Repayments**:
           - Masukkan baris-baris jadwal hasil generator ke `public.loan_schedules` mengaitkan `loan_id` yang baru dibuat.
           - Untuk setiap jadwal yang memiliki `paid_amount > 0`:
             Masukkan record ke `public.loan_repayments`:
             ```typescript
             {
               loan_id: newLoan.id,
               schedule_id: sched.id,
               amount_paid: sched.paid_amount,
               payment_method: 'migration',
               payment_date: sched.due_date,
               notes: 'Migrasi Angsuran Lampau'
             }
             ```
  </action>
  <verify>
    Saat file migrasi diimpor berulang kali untuk anggota yang sama:
    - Tidak terjadi duplikasi record pinjaman (pinjaman lama terhapus bersih dan digantikan pinjaman baru).
    - Status pinjaman adalah 'completed' jika sisa_pinjaman == 0, atau 'active' jika sisa_pinjaman > 0.
    - Sisa pokok yang belum terbayar di `loan_schedules` tepat sama dengan `sisa_pinjaman`.
  </verify>
  <done>
    Penyimpanan pinjaman migrasi terintegrasi penuh secara atomik, aman, dan idempoten.
  </done>
</task>

<task type="auto">
  <name>Update ManajemenAnggota Flow & Toast Notifications</name>
  <files>
    src/pages/admin/ManajemenAnggota.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ManajemenAnggota.tsx`:
    2. Pada penanganan eksekusi impor (`handleConfirmImport`):
       - Hitung jumlah anggota yang diproses serta jumlah anggota yang memiliki data pinjaman migrasi.
       - Tampilkan pesan toast sukses yang informatif: misalnya "Berhasil mengimpor {totalAnggota} anggota dan menyinkronkan {totalPinjaman} data pinjaman migrasi".
       - Muat ulang data anggota (`loadData()`) agar kolom `bank_account_number` dan status terkini langsung tampil pada grid tabel.
  </action>
  <verify>
    Setelah proses impor selesai, notifikasi sukses tampil dengan rincian yang benar dan tabel anggota langsung tersegarkan.
  </verify>
  <done>
    Alur UI dan feedback import pinjaman migrasi pada Manajemen Anggota berjalan mulus.
  </done>
</task>

## Success Criteria
- [ ] Kolom `bank_account_number` tersimpan dan terbarui pada tabel `public.anggota`
- [ ] Pinjaman migrasi tersimpan di `public.loans` dengan nomor format `PINJ-MIGRASI-${nrp}`
- [ ] Rekonsiliasi jadwal tenor di `public.loan_schedules` mencerminkan angsuran yang lunas (`paid`), sebagian (`partial`), dan belum dibayar (`unpaid`)
- [ ] Clean Overwrite menjamin re-import tidak menduplikasi baki hutang atau jadwal pinjaman
