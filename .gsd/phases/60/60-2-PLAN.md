---
phase: 60
plan: 2
wave: 2
gap_closure: false
---

# Plan 60.2: Render Colored Numeric Installments and Status Legend in LoanMatrix.tsx

## Objective
Mengganti ikon checklist di dalam sel tabel matriks pinjaman bulanan (`LoanMatrix.tsx`) menjadi tampilan angka nominal angsuran dengan penanda warna status dinamis (Hijau untuk Lunas, Kuning untuk Parsial, Merah untuk Menunggak, Abu-abu untuk Proyeksi, dan Strip untuk di luar periode pinjaman), menyertakan tooltip informatif, serta menambahkan legenda status di atas atau di bawah tabel matriks.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/services/loanMatrixService.ts
- src/pages/admin/LoanMatrix.tsx
- src/pages/admin/LoanMatrix.test.tsx

## Tasks

<task type="auto">
  <name>Implement Nominal Formatter, Status Badge Resolver & Status Legend</name>
  <files>
    src/pages/admin/LoanMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.tsx`.
    2. Import `MonthLoanCell` dari `../../services/loanMatrixService`.
    3. Buat helper function pemformat angka nominal:
       ```typescript
       export const formatAmount = (num: number): string => {
         if (!num || num === 0) return '-';
         return Number(num).toLocaleString('id-ID');
       };
       ```
    4. Buat helper function `getCellBadge(cell: MonthLoanCell)` yang menormalisasi status (mengabaikan case-sensitivity) dan mengembalikan:
       - `text`: string nominal yang relevan (misal `paidAmount` untuk lunas/parsial, `targetAmount` untuk tunggakan/proyeksi, atau `-` untuk none).
       - `className`: styling CSS Tailwind sesuai status:
         * Lunas (`PAID`, `FINISHED`, `paid`):
           `'text-emerald-700 bg-emerald-50 border border-emerald-200 font-semibold'`
         * Parsial (`PARTIAL`, `partial`):
           `'text-amber-700 bg-amber-50 border border-amber-200 font-semibold'`
         * Menunggak (`UNPAID`, `unpaid`):
           `'text-rose-700 bg-rose-50 border border-rose-200 font-bold'`
         * Proyeksi (`PROJECTED`, `projection`):
           `'text-slate-400 bg-slate-50 border border-dashed border-slate-200 font-normal'`
         * Default / Di luar masa tenor (`NONE`, `not_applicable`, dll):
           `'text-slate-300 font-normal'`
       - `tooltip`: teks penjelasan komprehensif (Target, Terbayar, Sisa Hutang, Jatuh Tempo).
    5. Hapus atau refaktor rendering ikon checklist lama (`getCellIcon`) di dalam `<td>` bulan Jan - Des:
       Ganti dengan elemen badge berbasis angka nominal:
       ```tsx
       {(() => {
         const badge = getCellBadge(cell);
         if (cell.status === 'NONE') {
           return (
             <div className="w-full py-1.5 text-center text-slate-300 font-normal select-none">
               -
             </div>
           );
         }
         return (
           <div className="relative group cursor-help">
             <div className={`px-2 py-1.5 rounded-lg text-xs font-mono text-center select-none transition-all ${badge.className}`}>
               {badge.text}
             </div>
             {/* Rich Tooltip */}
             <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl z-50 transition-all pointer-events-none">
               <div className="font-semibold mb-1 border-b border-slate-600 pb-1">
                 No: {cell.loanNumber || '-'}
               </div>
               <div className="flex justify-between mt-1">
                 <span className="text-slate-300">Status:</span>
                 <span className="font-medium">{badge.statusLabel}</span>
               </div>
               <div className="flex justify-between mt-1">
                 <span className="text-slate-300">Tenor:</span>
                 <span>{cell.periodNumber ? `${cell.periodNumber} / ${cell.tenor}` : '-'}</span>
               </div>
               <div className="flex justify-between mt-1">
                 <span className="text-slate-300">Target:</span>
                 <span>Rp {formatAmount(cell.targetAmount)}</span>
               </div>
               <div className="flex justify-between mt-1 text-emerald-400">
                 <span>Terbayar:</span>
                 <span>Rp {formatAmount(cell.paidAmount)}</span>
               </div>
               {cell.remainingBalance !== undefined && (
                 <div className="flex justify-between mt-1 pt-1 border-t border-slate-600 text-amber-400">
                   <span>Sisa Angsuran:</span>
                   <span>Rp {formatAmount(cell.remainingBalance)}</span>
                 </div>
               )}
               <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-800"></div>
             </div>
           </div>
         );
       })()}
       ```
    6. Tambahkan komponen Legenda Status (Status Legend) tepat di atas atau di bawah tabel matriks:
       - Hijau: Lunas
       - Kuning: Parsial
       - Merah: Terlewat / Menunggak
       - Abu-abu Putus-Putus: Proyeksi Angsuran
       - Strip: Di Luar Masa Tenor
    
    AVOID: Mengurangi lebar minimum kolom sehingga angka terpotong (`min-w-[110px]` disarankan pada header `<th>` bulan).
    USE: Tipografi font-mono untuk angka nominal agar sejajar dan mudah dibaca.
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    Sel matriks pinjaman menampilkan angka nominal berformat mata uang dan warna status dinamis, dilengkapi legenda status.
  </done>
</task>

<task type="auto">
  <name>Update and Expand LoanMatrix.test.tsx for Colored Numbers and Legend</name>
  <files>
    src/pages/admin/LoanMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.test.tsx`.
    2. Perbarui mock data jika diperlukan agar memuat `targetAmount` dan `paidAmount`.
    3. Tambahkan pengujian unit baru:
       - Menguji fungsi `formatAmount` dengan angka valid, nol, atau tidak terdefinisi.
       - Menguji helper `getCellBadge` untuk masing-masing status: PAID (emerald), PARTIAL (amber), UNPAID (rose), PROJECTED (slate), dan NONE (-).
       - Menguji keberadaan elemen legenda status dalam hasil render markup (`Lunas`, `Parsial`, `Menunggak`, `Proyeksi`).
       - Memastikan tidak ada lagi elemen ikon centang dalam tabel sel data.
    4. Jalankan vitest untuk memverifikasi seluruh suite pengujian lulus.
  </action>
  <verify>
    npx vitest run src/pages/admin/LoanMatrix.test.tsx
  </verify>
  <done>
    Unit tests untuk LoanMatrix.tsx berhasil memvalidasi rendering angka nominal berwarna dan legenda status.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Sel bulan di matriks menampilkan angka nominal berformat mata uang ribuan.
- [ ] Warna status sesuai: Lunas (Hijau), Parsial (Kuning), Menunggak (Merah), Proyeksi (Abu-abu), Di Luar Periode (Strip).
- [ ] Legenda status tampil di halaman matriks pinjaman.
- [ ] Seluruh unit test di `LoanMatrix.test.tsx` lulus.

## Success Criteria
- [ ] UI tabel bebas dari ikon checklist.
- [ ] Tidak ada regresi fungsionalitas pencarian, filter status, filter tahun, atau ekspor Excel.

