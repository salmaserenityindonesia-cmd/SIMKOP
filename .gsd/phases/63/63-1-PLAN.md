---
phase: 63
plan: 1
wave: 1
gap_closure: false
---

# Plan 63.1: Auto-Populate Remaining Balance & Service Payment Accumulation Engine

## Objective
Mengimplementasikan otomatisasi pengisian form (*auto-populate*) pada sub-modal "Dokumentasi Bukti Pelunasan Angsuran" (`LoanScheduleModal.tsx` / `LoanLedgerModal.tsx`) saat jadwal angsuran berstatus parsial, serta menyelaraskan kalkulasi akumulasi pembayaran pada service pinjaman (`loanMatrixService.ts` / `loanService.ts`):
1. Menghitung nilai sisa kekurangan angsuran secara presisi: `remainingDeficit = Math.max(0, targetAmount - paidAmount)`.
2. Mengisi default input `evidenceAmount` dengan `remainingDeficit` (jika sisa > 0) atau `targetAmount` (jika belum ada pembayaran), dengan tetap memungkinkan admin mengubah nominal secara manual.
3. Mengisi default catatan keterangan transaksi secara otomatis: `"Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-[bulan]"` jika `remainingDeficit > 0` dan `paidAmount > 0`.
4. Memastikan metode pembayaran secara default terpilih `'potong_gaji'` dan nomor kwitansi otomatis ter-generate rapi.
5. Memperbarui `toggleLoanSchedulePaid` pada `src/services/loanMatrixService.ts` agar mengkalkulasi akumulasi pembayaran jadwal pinjaman (`newPaidAmount = existingPaid + payAmount`), sehingga saat admin melunasi selisih kekurangan (misal Rp 7 dari kekurangan Rp 277.778 vs Rp 277.771), status periode langsung berubah menjadi `paid` (lunas / hijau) dengan `paid_amount` menjadi Rp 277.778 penuh.
6. Menyediakan helper function kalkulasi sisa angsuran di `src/services/loanService.ts` / `src/services/loanMatrixService.ts`.
7. Menambahkan pengujian komprehensif pada `src/components/loans/LoanScheduleModal.test.tsx` dan `src/services/loanMatrixService.test.ts`.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/components/loans/LoanScheduleModal.tsx
- src/components/loans/LoanScheduleModal.test.tsx
- src/services/loanMatrixService.ts
- src/services/loanMatrixService.test.ts
- src/services/loanService.ts

## Tasks

<task type="auto">
  <name>Auto-Populate Remaining Deficit, Notes & Defaults in Repayment Modal and Update Service Accumulation</name>
  <files>
    src/components/loans/LoanScheduleModal.tsx
    src/services/loanMatrixService.ts
    src/services/loanService.ts
  </files>
  <action>
    1. Buka `src/services/loanService.ts` dan/atau `src/services/loanMatrixService.ts`:
       - Tambahkan dan ekspor helper kalkulasi sisa angsuran:
         ```typescript
         export const calculateRemainingInstallmentDeficit = (
           targetAmount: number,
           paidAmount: number
         ): number => {
           return Math.max(0, Number(targetAmount || 0) - Number(paidAmount || 0));
         };
         ```
    2. Buka `src/services/loanMatrixService.ts`:
       - Pada fungsi `toggleLoanSchedulePaid`:
         Saat `paid === true`, ambil nilai pembayaran sebelumnya `currentPaid = Number(schedule.paid_amount || 0)`.
         Hitung akumulasi pembayaran baru:
         ```typescript
         const newPaidAmount = Math.min(
           Number(schedule.target_amount || 0),
           currentPaid + payAmount
         );
         const newStatus = newPaidAmount >= Number(schedule.target_amount)
           ? 'paid'
           : (newPaidAmount > 0 ? 'partial' : 'unpaid');
         ```
         Simpan `paid_amount: newPaidAmount` dan `status: newStatus` pada pembaruan `loan_schedules`.
         Pastikan pencatatan `loan_repayments` tetap mencatat nominal setoran aktual saat ini (`amount_paid: payAmount`).
    3. Buka `src/components/loans/LoanScheduleModal.tsx`:
       - Pada fungsi `handleTogglePeriod(period: LoanGridPeriod)`:
         Hitung sisa kekurangan angsuran:
         ```typescript
         const target = Number(period.targetAmount || 0);
         const paid = Number(period.paidAmount || 0);
         const remainingDeficit = Math.max(0, target - paid);
         const defaultNominal = remainingDeficit > 0 ? remainingDeficit : target;
         setEvidenceAmount(defaultNominal);
         ```
       - Auto-generate catatan default jika ada pembayaran parsial:
         ```typescript
         if (remainingDeficit > 0 && paid > 0) {
           setEvidenceNotes(`Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-${period.periodNumber}`);
         } else {
           setEvidenceNotes('');
         }
         ```
       - Pastikan `evidencePaymentMethod` di-set default ke `'potong_gaji'`.
       - Pastikan nomor kwitansi default tetap terisi (`KW-PINJ/${data?.loanNumber || '01'}/B${period.periodNumber}`).
       - Pada form tampilan modal bukti pelunasan:
         Tampilkan informasi pembantu di bawah input nominal:
         Jika `paid > 0`, tampilkan:
         `"Sudah terbayar: Rp {formatAmount(paid)} | Sisa kekurangan: Rp {formatAmount(remainingDeficit)}"`
  </action>
  <verify>
    Jalankan pemeriksaan typecheck TypeScript:
    `npx tsc --noEmit`
  </verify>
  <done>
    Input nominal terisi otomatis dengan sisa kekurangan angsuran (misal Rp 7), catatan default terisi rapi, dan `toggleLoanSchedulePaid` mengakumulasikan `paid_amount` secara tepat.
  </done>
</task>

<task type="auto">
  <name>Unit & Component Tests for Deficit Auto-Populate and Service Accumulation</name>
  <files>
    src/components/loans/LoanScheduleModal.test.tsx
    src/services/loanMatrixService.test.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.test.ts`:
       - Tambahkan unit test untuk `calculateRemainingInstallmentDeficit`.
       - Tambahkan unit test untuk `toggleLoanSchedulePaid` pada skenario pelunasan parsial berlanjut (misal schedule awal memiliki `target_amount = 277778`, `paid_amount = 277771`, lalu dilakukan pembayaran selisih `payAmount = 7`):
         - Verifikasi bahwa `loan_repayments` di-insert dengan `amount_paid: 7`.
         - Verifikasi bahwa `loan_schedules` di-update dengan `paid_amount: 277778` dan `status: 'paid'`.
    2. Buka `src/components/loans/LoanScheduleModal.test.tsx`:
       - Tambahkan component unit test yang mensimulasikan klik toggle period berstatus PARTIAL:
         - Periksa bahwa state modal bukti terbuka.
         - Periksa bahwa input nominal `evidence-amount-input` bernilai `7` (bukan 0 atau 277778).
         - Periksa bahwa catatan `evidence-notes-input` otomatis terisi `"Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-[N]"`.
         - Periksa bahwa metode pembayaran terpilih `'potong_gaji'`.
  </action>
  <verify>
    Jalankan test suite yang relevan:
    `npx vitest run src/services/loanMatrixService.test.ts src/components/loans/LoanScheduleModal.test.tsx`
  </verify>
  <done>
    Semua pengujian unit dan komponen terkait auto-populate sisa kekurangan angsuran dan akumulasi service lulus 100%.
  </done>
</task>

## Success Criteria
- [ ] Helper kalkulasi sisa angsuran `calculateRemainingInstallmentDeficit` tersedia dan teruji.
- [ ] Modal Dokumentasi Bukti Pelunasan menginisialisasi `evidenceAmount` dengan sisa kekurangan angsuran saat periode berstatus parsial.
- [ ] Catatan transaksi terisi otomatis dengan format `"Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-[N]"` saat melunasi sisa kekurangan.
- [ ] Metode pembayaran default adalah `'potong_gaji'` dan kwitansi otomatis terpasang.
- [ ] `toggleLoanSchedulePaid` mengakumulasikan pembayaran sehingga angsuran parsial yang dilunasi sisa kekurangannya menjadi lunas penuh (`status: 'paid'`).
- [ ] Seluruh unit test di `LoanScheduleModal.test.tsx` dan `loanMatrixService.test.ts` passed.

