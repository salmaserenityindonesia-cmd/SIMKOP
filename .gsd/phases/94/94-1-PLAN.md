---
phase: 94
plan: 1
wave: 1
gap_closure: false
---

# Plan 94.1: Auto-Settle All Loan Schedules in Clearance Execution

## Objective
Memastikan proses kliring pengunduran diri anggota di `/admin/clearance` secara atomik melunaskan seluruh jadwal angsuran pinjaman yang belum lunas (`loan_schedules`), mencatat riwayat pelunasan kliring di `loan_repayments`, menyetel `sisa_pinjaman = 0` dan `status = 'completed'` pada tabel `loans`, serta menyediakan skrip migrasi SQL RPC Supabase yang sinkron.

## Context
- Layanan UI & Handler: `src/services/settlementService.ts`, `src/pages/admin/SettlementClearance.tsx`
- Skrip Migrasi RPC Supabase: `supabase/migrations/047_settle_loan_schedules_on_clearance.sql`
- Unit Test: `src/services/settlementService.test.ts`

Masalah Saat Ini:
Ketika anggota keluar diproses melalui tombol "Proses Pengunduran Diri" pada `/admin/clearance`, pinjaman aktif diubah statusnya menjadi `'completed'`, namun jadwal angsuran (`loan_schedules`) yang belum jatuh tempo tetap berstatus `unpaid`/`partial` dengan sisa tagihan. Hal ini menyebabkan inkonsistensi data di mana status pinjaman induk sudah selesai, tetapi riwayat jadwal angsuran masih menggantung.

## Tasks

<task type="auto">
  <name>Settle Remaining Loan Schedules upon Member Resignation in settlementService</name>
  <files>
    src/services/settlementService.ts
    src/services/settlementService.test.ts
  </files>
  <action>
    1. Buka `src/services/settlementService.ts`:
       - Buat helper method internal atau tambahkan logika dalam `processInstantPayoff`:
         a. Ambil seluruh pinjaman aktif anggota:
            `loans` dengan `member_id = memberId` dan `status IN ('active', 'approved', 'draft')`.
         b. Untuk setiap pinjaman tersebut:
            - Ambil seluruh jadwal angsuran (`loan_schedules`) yang belum lunas:
              `loan_id = loan.id` dan `status IN ('unpaid', 'partial')`.
            - Untuk setiap jadwal angsuran yang memiliki sisa tagihan:
              * Hitung sisa: `Number(sched.target_amount) - Number(sched.paid_amount || 0)`.
              * Update `loan_schedules`:
                `paid_amount = sched.target_amount`, `status = 'paid'`.
              * Masukkan entri ke `loan_repayments`:
                `loan_id: loan.id`,
                `schedule_id: sched.id`,
                `amount_paid: sisa`,
                `payment_method: paymentMethod || 'POTONG_SIMPANAN_KLIRING'`,
                `notes: notes || 'Pelunasan otomatis melalui kliring anggota keluar (net settlement)'`,
                `created_at: new Date().toISOString()`.
            - Update data pinjaman induk di tabel `loans`:
              `status = 'completed'`,
              `sisa_pinjaman = 0`.
       - Pastikan pemanggilan RPC `process_instant_payoff_clearance` tetap dieksekusi atau didampingi penuntasan jadwal angsuran secara atomik dan aman dari kegagalan jaringan/RPC.
    2. Tambahkan unit test di `src/services/settlementService.test.ts` untuk memverifikasi bahwa pelunasan seketika (`processInstantPayoff`) mengeksekusi penutupan jadwal angsuran dan pencatatan pembayaran pelunasan kliring.
  </action>
  <verify>
    Jalankan `npx vitest run src/services/settlementService.test.ts` dan pastikan seluruh test kasus terkait pelunasan kliring lulus 100%.
  </verify>
</task>

<task type="auto">
  <name>Create Supabase Migration for Atomic Clearance Loan Settlement</name>
  <files>
    supabase/migrations/047_settle_loan_schedules_on_clearance.sql
  </files>
  <action>
    1. Buat file migrasi baru `supabase/migrations/047_settle_loan_schedules_on_clearance.sql`.
    2. Perbarui fungsi `public.process_instant_payoff_clearance`:
       - Lakukan iterasi pada setiap pinjaman aktif anggota (`status IN ('approved', 'active')`):
         * Loop jadwal angsuran `loan_schedules` yang belum lunas (`status IN ('unpaid', 'partial')`).
         * Masukkan record ke `loan_repayments` dengan nominal sisa angsuran (`target_amount - COALESCE(paid_amount, 0)`) dan metode `'POTONG_SIMPANAN_KLIRING'`.
         * Set `paid_amount = target_amount` dan `status = 'paid'` pada `loan_schedules`.
         * Set `status = 'completed'` dan `sisa_pinjaman = 0` pada `loans`.
    3. Perbarui juga fungsi `public.process_member_clearance` (jika dipanggil legacy) dengan logika pelunasan jadwal yang serupa.
  </action>
  <verify>
    File migrasi `047_settle_loan_schedules_on_clearance.sql` valid secara sintaks SQL PL/pgSQL dan mencakup pelunasan seluruh sisa jadwal angsuran.
  </verify>
</task>
