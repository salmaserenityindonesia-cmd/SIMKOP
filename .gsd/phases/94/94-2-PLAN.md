---
phase: 94
plan: 2
wave: 2
gap_closure: false
---

# Plan 94.2: Loan Matrix Tooltip Fallback & Completed Loan Alignment

## Objective
Menyelaraskan kalkulasi dan rendering popover/tooltip sel jadwal angsuran serta metrik kepatuhan pada `/admin/loan-matrix` (`LoanMatrix.tsx` dan `loanMatrixService.ts`) agar pinjaman yang berstatus selesai (`isLoanActive === false` atau `status === 'completed'`) secara konsisten menampilkan "Sisa Angsuran: Rp 0 (Lunas)" dengan badge hijau dan kepatuhan 100%.

## Context
- Komponen UI: `src/pages/admin/LoanMatrix.tsx`
- Service: `src/services/loanMatrixService.ts`
- Unit Test: `src/pages/admin/LoanMatrix.test.tsx`, `src/services/loanMatrixService.test.ts`

Masalah Saat Ini:
Pada halaman `/admin/loan-matrix`, meskipun badge pinjaman berstatus "Selesai", sel jadwal angsuran di bulan-bulan mendatang atau sisa tenor masih dapat menampilkan tooltip "Sisa Angsuran: Rp X" (berwarna kuning/merah) jika data jadwal historis belum tersinkron atau pembacaan tooltip hanya mengandalkan `cell.remainingBalance`.

## Tasks

<task type="auto">
  <name>Align Tooltip Remaining Balance for Completed Loans in LoanMatrix.tsx</name>
  <files>
    src/pages/admin/LoanMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.tsx`:
    2. Pada bagian render popover/tooltip sel angsuran (sekitar baris 650-675):
       - Tentukan status penyelesaian pinjaman induk:
         ```typescript
         const isLoanCompleted = !row.isLoanActive || row.status === 'completed' || row.status === 'paid_off';
         ```
       - Hitung sisa angsuran dengan mempertimbangkan status lunas pinjaman:
         ```typescript
         const remainingInstallment = isLoanCompleted 
           ? 0 
           : Math.max(0, Number(cell?.remainingBalance !== undefined ? cell.remainingBalance : (Number(cell?.targetAmount || 0) - Number(cell?.paidAmount || 0))));
         ```
       - Perbarui tampilan bagian "Sisa Angsuran" di tooltip:
         * Jika `isLoanCompleted` atau `remainingInstallment === 0`:
           Tampilkan:
           ```tsx
           <div className="flex justify-between mt-1 pt-1 border-t border-slate-600 text-emerald-400">
             <span>Sisa Angsuran:</span>
             <span>Rp 0 (Lunas)</span>
           </div>
           ```
         * Jika belum lunas (`!isLoanCompleted` dan `remainingInstallment > 0`):
           Tampilkan dengan styling standar text-amber-400:
           ```tsx
           <div className="flex justify-between mt-1 pt-1 border-t border-slate-600 text-amber-400">
             <span>Sisa Angsuran:</span>
             <span>Rp {formatAmount(remainingInstallment)}</span>
           </div>
           ```
       - Pastikan badge kepatuhan row menampilkan 100% jika pinjaman sudah berstatus lunas/selesai (`isLoanCompleted`).
  </action>
  <verify>
    Buka/uji komponen `LoanMatrix`: untuk pinjaman yang tidak aktif (`isLoanActive: false`), tooltip sel angsuran menampilkan "Sisa Angsuran: Rp 0 (Lunas)" berwarna hijau (`text-emerald-400`).
  </verify>
</task>

<task type="auto">
  <name>Update loanMatrixService to Handle Completed Loans Cleanly</name>
  <files>
    src/services/loanMatrixService.ts
    src/pages/admin/LoanMatrix.test.tsx
    src/services/loanMatrixService.test.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.ts`:
       - Pada perulangan pembentukan data matriks:
         * Jika pinjaman berstatus `'completed'`, pastikan sel jadwal diisi status `'FINISHED'` atau `'PAID'`, dan `remainingBalance` disetel ke 0.
         * Pada perhitungan `complianceYTD`, pastikan pinjaman berstatus selesai menghasilkan kepatuhan 100%.
    2. Tambahkan/sesuaikan unit test pada `src/pages/admin/LoanMatrix.test.tsx` dan `src/services/loanMatrixService.test.ts` untuk memverifikasi perilaku rendering sel dan tooltip pinjaman berstatus 'completed'/'paid_off'.
  </action>
  <verify>
    Jalankan `npx vitest run src/pages/admin/LoanMatrix.test.tsx src/services/loanMatrixService.test.ts` dan pastikan seluruh test kasus berhasil.
  </verify>
</task>
