---
phase: 97
plan: 2
wave: 2
gap_closure: false
---

# Plan 97.2: Backfill Idempoten Kwitansi Migrasi, Pembersihan Duplikasi Gelondongan & Guard Tanggal Lunas di `paidOffLoansReportService.ts`

## Objective
Menyelaraskan data historis di `public.loan_repayments` saat laporan pinjaman lunas dimuat melalui mekanisme backfill idempoten ber-lock (*in-flight lock*) tanpa menambah catatan baru ke `public.cash_flow`, membersihkan sisa baris gelondongan `SALDO_AWAL` / `migrasi_awal`, dan membatasi tanggal pelunasan (`paidOffDate <= todayDate`) agar tidak tampil tanggal masa depan seperti `1 Des 2026`.

## Context
- `.gsd/SPEC.md`
- `.gsd/phases/97/RESEARCH.md`
- `src/services/paidOffLoansReportService.ts`
- `src/services/orphanAuditService.ts` (`filterRedundantLegacySaldoAwalRepayments`)
- `src/pages/admin/LaporanPinjamanLunas.test.tsx`

## Tasks

<task type="auto">
  <name>Implement Idempotent Migration Repayment Backfill (No CashFlow) and Future Payoff Date Clamping</name>
  <files>
    src/services/paidOffLoansReportService.ts
  </files>
  <action>
    1. Tambahkan helper `getLocalTodayYmd()` dan `clampIsoOrYmdToToday(rawDate: string | null | undefined, todayYmd: string): string | null` di `src/services/paidOffLoansReportService.ts`:
       - Jika tanggal `YYYY-MM-DD` (atau bagian tanggal awal dari ISO timestamp) lebih besar dari `todayYmd`, kunci ke `todayYmd` (atau `${todayYmd}T08:00:00.000Z` bila input bertipe ISO timestamp).
    2. Buat fungsi idempoten `syncMissingMigrationRepaymentsForSettledSchedules()` dengan *in-flight lock* (`let migrationRepaymentBackfillLock: Promise<void> | null = null;` yang di-reset di `finally`) dan dipanggil pada awal `getPaidOffLoansReport`:
       - Gunakan `fetchAllPaginatedSafe` (mock-safe untuk test yang tidak memakai `.range()`) untuk mencari semua jadwal `loan_schedules` yang `paid_amount > 0` atau `status === 'paid'`.
       - Bila tabel `loan_schedules` tidak memiliki baris yang memenuhi atau mock tidak menyediakan filter, keluar dengan aman (non-blocking) tanpa melempar error ke caller.
       - Untuk `loan_id` yang ditemukan, ambil metadata kontrak (`id, loan_number, disbursed_at, created_at`) dari `loans` dan rekaman eksisting dari `loan_repayments` (dalam chunk ID agar aman dari batas URL).
       - Deteksi jadwal terbayar yang belum memiliki baris padanan di `loan_repayments` (baik berdasarkan `schedule_id` maupun `receipt_number = KW-MIGRASI/${loanNumber}/B${period_number}`). Pastikan hanya menyisipkan jadwal yang benar-benar belum tercatat.
       - Sisipkan baris baru ke `public.loan_repayments` secara batch (dengan fallback jika kolom `receipt_number` tidak ada seperti pola `orphanAuditService.ts`):
         - `loan_id`, `schedule_id`, `amount_paid: Math.round(Number(sch.paid_amount || sch.target_amount || 0))`,
         - `payment_date: ${safeYmd}T08:00:00.000Z` dengan `safeYmd = clampToToday(due_date || disbursed_at || created_at)`,
         - `payment_method: 'SALDO_AWAL_MIGRASI'`,
         - `receipt_number: KW-MIGRASI/${loanNumber}/B${periodNumber}`,
         - `notes: Angsuran Saldo Awal Migrasi (${loanNumber}) Bln ke-${periodNumber}`.
       - **PENTING (AVOID)**: Jangan pernah menulis ke `public.cash_flow` dari helper backfill ini agar tidak terjadi *double counting* dengan entri `SALDO-AWAL` kas yang sudah ada.
       - Untuk kontrak yang menerima backfill (atau sudah punya `SALDO_AWAL_MIGRASI`), deteksi & hapus baris gelondongan lama di `loan_repayments` (`payment_method IN ('SALDO_AWAL', 'migrasi_awal')` atau `notes` mengandung `'Total Terangsur Saldo Awal'` / `'Ringkasan Total Terangsur Saldo Awal'`) menggunakan `filterRedundantLegacySaldoAwalRepayments` atau predikat sejenis.
    3. Pada loop pembentukan `rows` di `getPaidOffLoansReport` (baris 706–738):
       - Saat menghitung `paidOffDate` (baik dari `loanRepayments` maupun fallback `loanSchedules` / `loan`), clamp nilainya melalui `clampIsoOrYmdToToday(paidOffDate, todayYmd)` sebelum menghitung `paidOffYear` dan mengembalikan baris laporan.
  </action>
  <verify>
    `npx vitest run src/pages/admin/LaporanPinjamanLunas.test.tsx`
  </verify>
  <done>
    `getPaidOffLoansReport` otomatis melakukan backfill `loan_repayments` (`SALDO_AWAL_MIGRASI`) secara idempoten dengan in-flight lock tanpa menulis `cash_flow`, membersihkan duplikasi `SALDO_AWAL`, dan tidak pernah menghasilkan `paidOffDate > today`.
  </done>
</task>

<task type="auto">
  <name>Add Unit Tests for Idempotent Backfill, In-Flight Lock, Legacy Cleanup, and Date Clamping</name>
  <files>
    src/pages/admin/LaporanPinjamanLunas.test.tsx
  </files>
  <action>
    1. Tambahkan test di `src/pages/admin/LaporanPinjamanLunas.test.tsx` untuk memverifikasi:
       - Kontrak lunas dengan jadwal `status = 'paid'`, `paid_amount > 0` yang belum punya baris `loan_repayments` akan otomatis di-backfill ke `loan_repayments` dengan `payment_method: 'SALDO_AWAL_MIGRASI'`, `receipt_number: 'KW-MIGRASI/.../B...'`, `payment_date <= today`, dan **0 insert** ke `cash_flow`.
       - Bila kontrak tersebut juga memiliki baris gelondongan `SALDO_AWAL` / `migrasi_awal`, baris gelondongan tersebut dihapus (`delete` pada `loan_repayments`) dan tidak dihitung ganda.
       - Pemanggilan `getPaidOffLoansReport` secara paralel (`Promise.all`) hanya menjalankan proses backfill satu kali berkat *in-flight lock* dan tidak menggandakan insert jika dipanggil ulang setelah data ada.
       - Kontrak dengan `payment_date` atau fallback `due_date` di masa depan (mis. `'2026-12-01'` saat timer di-set `'2026-11-25'`) menghasilkan `paidOffDate` yang dikunci maksimal `'2026-11-25'`, bukan `'2026-12-01'`.
    2. Pastikan seluruh 18 test existing di `LaporanPinjamanLunas.test.tsx` tetap lulus.
  </action>
  <verify>
    `npx vitest run src/pages/admin/LaporanPinjamanLunas.test.tsx`
  </verify>
  <done>
    Seluruh unit test di `src/pages/admin/LaporanPinjamanLunas.test.tsx` lulus tanpa error maupun regresi.
  </done>
</task>

## Must-Haves
- [ ] Jadwal migrasi terbayar tanpa baris `loan_repayments` otomatis mendapatkan kwitansi `KW-MIGRASI/{loan_number}/B{period_number}` (`SALDO_AWAL_MIGRASI`) secara idempoten.
- [ ] Backfill **tidak** menyisipkan baris ke `public.cash_flow`.
- [ ] Baris gelondongan `SALDO_AWAL` / `migrasi_awal` yang ganda otomatis dibersihkan.
- [ ] `paidOffDate` selalu dibatasi `<= todayDate` sehingga tanggal masa depan (`1 Des 2026`) tidak muncul.

## Success Criteria
- [ ] `npx vitest run src/pages/admin/LaporanPinjamanLunas.test.tsx` lulus 100%.
