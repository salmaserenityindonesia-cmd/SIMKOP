---
phase: 73
plan: 2
wave: 2
gap_closure: false
---

# Plan 73.2: Dynamic Rolling Headers & Cumulative Tooltips in ComplianceMatrix

## Objective
Memperbarui antarmuka tabel Matriks Kepatuhan Simpanan di `src/pages/admin/ComplianceMatrix.tsx` untuk menampilkan header kolom 12 bulan bergulir dinamis (`rollingMonths`) menggantikan kolom statis Jan–Des, menampilkan indikator visual Saldo Bawaan (Opening Balance) pada kolom bulan pertama, dan menyajikan tooltip interaktif yang menampilkan akumulasi terbayar berantai serta persentase pencapaian terhadap saldo simpanan anggota.

## Context
Load these files for context:
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/services/complianceService.ts`
- `src/pages/admin/ComplianceMatrix.test.tsx`

## Tasks

<task type="auto">
  <name>Render Dynamic Rolling 12-Month Table Headers in ComplianceMatrix.tsx</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`:
       - Import `MonthPeriod` dan `getRolling12Months` dari `../../services/complianceService`.
       - Hitung atau ambil daftar kolom periode 12 bulan bergulir:
         ```tsx
         const currentPeriod = useMemo(() => {
           const now = new Date();
           return { year: now.getFullYear(), month: now.getMonth() + 1 };
         }, []);

         const rollingMonths = useMemo(() => {
           return getRolling12Months(currentPeriod.year, currentPeriod.month);
         }, [currentPeriod]);
         ```
       - Ganti header tabel statis `MONTHS.map(...)`:
         ```tsx
         <thead>
           <tr>
             <th className="...">Informasi Anggota</th>
             {rollingMonths.map((col, idx) => {
               const isCurrentMonth = idx === rollingMonths.length - 1;
               return (
                 <th
                   key={col.periodIndex}
                   className={`py-3 px-2 border-b border-slate-200 text-center min-w-[95px] md:min-w-[105px] ${
                     isCurrentMonth ? 'bg-emerald-50/50 border-x-2 border-x-emerald-200/50 text-emerald-900 font-bold' : ''
                   }`}
                 >
                   <div>{col.label}</div>
                 </th>
               );
             })}
             <th className="...">Kepatuhan & Aksi</th>
           </tr>
         </thead>
         ```
       - Sesuaikan penanda highlight bulan berjalan agar menggunakan indeks kolom bulan berjalan (kolom ke-11).
  </action>
  <verify>
    Header tabel menampilkan 12 bulan bergulir berurutan dengan penamaan format `Bln-YY` (misal Des-25, Jan-26, ..., Nov-26) dan highlight tepat pada bulan berjalan.
  </verify>
  <done>
    Header tabel Matriks Kepatuhan Simpanan bersifat dinamis sesuai jendela 12 bulan bergulir.
  </done>
</task>

<task type="auto">
  <name>Update Cell Display with Opening Balance Indicator and Cumulative Tooltip</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`:
       - Perbarui fungsi `renderCell`:
         - Parameter: `(monthData: ComplianceMonthData | null, monthIndex: number, row: ComplianceMatrixRow)`.
         - Pada kolom pertama (`monthIndex === 0`):
           - Jika anggota memiliki `row.openingBalance` yang lebih besar dari 0 (total > 0), tampilkan penanda visual subtil di bagian atas/bawah sel:
             ```tsx
             <span
               className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 block text-center truncate"
               title={`Saldo Bawaan (pra-jendela): Rp ${Number(row.openingBalance.w + row.openingBalance.b + row.openingBalance.l).toLocaleString('id-ID')}`}
             >
               + Saldo Awal Rp {Number(row.openingBalance.w + row.openingBalance.b + row.openingBalance.l).toLocaleString('id-ID')}
             </span>
             ```
         - Pada Hover Tooltip sel simpanan:
           - Tampilkan rincian:
             * Label bulan: `${rollingMonths[monthIndex]?.label || `Bulan ${monthIndex + 1}`}`
             * Nominal Iuran Bulan Tersebut: `Rp [nominal]` (Wajib, Belanja, Lebaran)
             * Akumulasi Terbayar s/d Bulan Ini: `Rp [totalKumulatif]` (menggunakan `monthData.bal_w`, `bal_b`, `bal_l` atau `cum_w`, `cum_b`, `cum_l`)
             * Persentase terhadap Target / Total Saldo Anggota:
               $$\text{persentase} = \text{Math.round}((\text{totalKumulatif} / \text{totalTargetExcel}) \times 100)\%$$
         - Pada kolom bulan berjalan (kolom ke-11 paling kanan):
           - Nilai akumulasi terbayar s/d bulan ini seimbang dengan total nilai saldo kas riil anggota (`row.netSavings?.total`).
  </action>
  <verify>
    Arahkan kursor ke sel bulan matriks: tooltip menampilkan nominal setoran bulan ini dan akumulasi terbayar berantai. Kolom pertama menunjukkan indikator Saldo Awal jika ada.
  </verify>
  <done>
    Tampilan sel dan tooltip matriks simpanan menyajikan Saldo Bawaan dan kalkulasi akumulatif berantai.
  </done>
</task>

## Success Criteria
- [ ] Header kolom matriks menampilkan 12 bulan bergulir dinamis
- [ ] Kolom bulan pertama menyertakan indikator visual Saldo Awal jika anggota memiliki mutasi pra-12 bulan
- [ ] Tooltip sel menyajikan nominal bulan berjalan, akumulasi kumulatif berantai, dan persentase
- [ ] Kolom bulan berjalan di ujung kanan seimbang dengan posisi kas riil simpanan anggota
