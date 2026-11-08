---
phase: 62
plan: 2
wave: 2
gap_closure: false
---

# Plan 62.2: Bind Cumulative Paid Amount to Popover Component & Component Tests

## Objective
Memperbarui tampilan tooltip sel bulanan pada halaman `/admin/loan-matrix` (`src/pages/admin/LoanMatrix.tsx`) agar menampilkan nominal angsuran terbayar secara kumulatif (sejak awal pinjaman s/d bulan yang di-hover) pada baris "Terbayar:", serta memperbarui pengujian komponen di `src/pages/admin/LoanMatrix.test.tsx`.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/pages/admin/LoanMatrix.tsx
- src/pages/admin/LoanMatrix.test.tsx
- src/services/loanMatrixService.ts

## Tasks

<task type="auto">
  <name>Bind Cumulative Paid to Monthly Cell Tooltip</name>
  <files>
    src/pages/admin/LoanMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.tsx`.
    2. Impor helper `getCumulativePaidUpToMonth` dari `../../services/loanMatrixService`:
       ```typescript
       import { getLoanMatrix, getCumulativePaidUpToMonth, LoanMatrixMember, LoanMatrixMonth, LoanMatrixSummary } from '../../services/loanMatrixService';
       ```
    3. Temukan blok rendering popover/tooltip sel bulanan pada baris "Terbayar:":
       ```tsx
       <div className="flex justify-between mt-1 text-emerald-400">
         <span>Terbayar:</span>
         <span>Rp {formatAmount(cell.paidAmount)}</span>
       </div>
       ```
    4. Ganti `formatAmount(cell.paidAmount)` dengan akumulasi kumulatif:
       ```tsx
       {(() => {
         const cumulativePaid = cell.cumulativePaidAmount !== undefined
           ? cell.cumulativePaidAmount
           : getCumulativePaidUpToMonth(member, m, year);
         return (
           <div className="flex justify-between mt-1 text-emerald-400">
             <span>Terbayar:</span>
             <span>Rp {formatAmount(cumulativePaid)}</span>
           </div>
         );
       })()}
       ```
    5. Pastikan label status, format pemisah ribuan Rupiah, dan tata letak tooltip tetap rapi dan tidak merusak elemen lainnya.
  </action>
  <verify>
    Jalankan pemeriksaan tipe: `npx tsc --noEmit`
  </verify>
  <done>
    Tooltip matriks pinjaman menampilkan angka nominal kumulatif terbayar s/d bulan yang di-hover.
  </done>
</task>

<task type="auto">
  <name>Update LoanMatrix Component Tests</name>
  <files>
    src/pages/admin/LoanMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.test.tsx`.
    2. Tambahkan unit test yang memverifikasi tooltip menampilkan akumulasi terbayar:
       - Skenario sel dengan `cumulativePaidAmount` (misal Rp 9.761.905 pada bulan ke-10 untuk tenor berjalan) menampilkan "Rp 9.761.905" pada label "Terbayar:".
       - Skenario fallback jika `cumulativePaidAmount` tidak disediakan secara langsung pada mock cell, nilai dihitung melalui `getCumulativePaidUpToMonth`.
       - Memastikan pergeseran antar bulan (misal bulan 1 vs bulan 2) menampilkan angka kumulatif yang konsisten bertambah.
    3. Pastikan test yang sudah ada tetap lulus tanpa regresi.
  </action>
  <verify>
    Jalankan test suite komponen:
    `npx vitest run src/pages/admin/LoanMatrix.test.tsx`
  </verify>
  <done>
    Pengujian komponen `LoanMatrix.test.tsx` lulus 100% dan memvalidasi tampilan nilai kumulatif terbayar pada tooltip.
  </done>
</task>

## Success Criteria
- [ ] Baris "Terbayar:" pada popover sel matriks pinjaman menampilkan total terbayar kumulatif s/d bulan tersebut
- [ ] Format angka menggunakan pemisah ribuan Rupiah standar (`formatAmount`)
- [ ] Pengujian di `src/pages/admin/LoanMatrix.test.tsx` memverifikasi rendering akumulasi terbayar
- [ ] Seluruh pengujian komponen lulus 100%

