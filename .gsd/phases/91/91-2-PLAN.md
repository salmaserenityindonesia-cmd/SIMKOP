---
phase: 91
plan: 2
wave: 2
gap_closure: false
---

# Plan 91.2: Render Saldo Pra-Tahun Column in LoanMatrix.tsx

## Objective
Menampilkan kolom "Saldo Pra Jan-XX (Akumulasi Lampau)" pada tabel Matriks Pinjaman `/admin/loan-matrix` (`src/pages/admin/LoanMatrix.tsx`) di antara kolom "ANGGOTA" dan kolom bulan "JAN".

## Context
- `src/pages/admin/LoanMatrix.tsx`
- `src/pages/admin/LoanMatrix.test.tsx`

Tampilan kolom:
- Header:
  - `Saldo Pra Jan-{String(selectedYear).slice(-2)}`
  - Subtitle: `Akumulasi Lampau`
- Body Cell:
  - P (Pokok): `row.principalAmount`
  - Lunas (Pra-Tahun): `row.priorYearPaid`
  - Sisa: `row.priorYearRemaining`
- Penyesuaian `colSpan`:
  - Baris loading & baris kosong: naik dari 14 menjadi 15.
- Ekspor Excel jika ada atau modal terkait disesuaikan agar tidak terjadi displacement kolom.

## Tasks

<task type="auto">
  <name>Add Saldo Pra-Jan Column to LoanMatrix Table</name>
  <files>
    src/pages/admin/LoanMatrix.tsx
    src/pages/admin/LoanMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.tsx`:
       - Pada `<thead>`, sisipkan `<th>` tepat setelah kolom `Anggota` dan sebelum mapping bulan `MONTHS`:
         ```tsx
         <th className="px-4 py-3 text-left font-bold text-slate-700 bg-slate-50 border-r border-slate-200 min-w-[140px]">
           <div>Saldo Pra Jan-{String(year).slice(-2)}</div>
           <div className="text-[10px] font-normal text-slate-500">Akumulasi Lampau</div>
         </th>
         ```
       - Pada `<tbody>`, perbarui `colSpan` pada state loading dan empty state menjadi `15` (sebelumnya `14`).
       - Pada baris anggota (`paginatedMembers.map`), tambahkan sel `<td>` setelah kolom data anggota:
         ```tsx
         <td className="px-4 py-3 border-r border-slate-200 bg-slate-50/40 text-xs" data-testid={`prior-summary-${row.memberId}`}>
           <div className="space-y-0.5">
             <div className="text-slate-500 flex justify-between gap-1">
               <span>P:</span>
               <span className="font-semibold text-slate-700">
                 Rp {Number(row.principalAmount || 0).toLocaleString('id-ID')}
               </span>
             </div>
             <div className="text-emerald-700 flex justify-between gap-1">
               <span>Lunas:</span>
               <span className="font-bold">
                 Rp {Number(row.priorYearPaid || 0).toLocaleString('id-ID')}
               </span>
             </div>
             <div className="text-amber-700 flex justify-between gap-1 border-t border-slate-200 pt-0.5">
               <span>Sisa:</span>
               <span className="font-semibold">
                 Rp {Number(row.priorYearRemaining || 0).toLocaleString('id-ID')}
               </span>
             </div>
           </div>
         </td>
         ```
    2. Perbarui/tambahkan unit test di `src/pages/admin/LoanMatrix.test.tsx`:
       - Verifikasi render header "Saldo Pra Jan" dan nilai pokok, lunas, sisa di dalam sel tabel.
    3. Jalankan pengujian `npm test -- --run src/pages/admin/LoanMatrix.test.tsx`.
  </action>
  <verify>
    `npm test -- --run src/pages/admin/LoanMatrix.test.tsx` lolos tanpa error.
  </verify>
</task>

