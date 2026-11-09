---
phase: 74
plan: 2
wave: 2
gap_closure: false
---

# Plan 74.2: Dynamic Table Headers & Prior Balance Summary Column in ComplianceMatrix

## Objective
Memperbarui antarmuka tabel Matriks Kepatuhan Simpanan di `src/pages/admin/ComplianceMatrix.tsx` untuk menampilkan kolom khusus Saldo Awal Pra-Jendela (`Saldo Pra [Bln-YY]`) tepat sebelum kolom bulan pertama, merender 12 header kolom bergulir lintas tahun hasil generator `getRolling12MonthRange`, dan memastikan seluruh data setoran dan akumulasi saldo tampil secara utuh tanpa kolom kosong tak terbayar di ujung kanan.

## Context
Load these files for context:
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/services/complianceService.ts`
- `src/pages/admin/ComplianceMatrix.test.tsx`

## Tasks

<task type="auto">
  <name>Render Prior Balance Summary Column and Rolling Month Headers in ComplianceMatrix.tsx</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`:
       - Impor `getRolling12MonthRange` atau fungsi pembantu terkait dari `src/services/complianceService.ts`.
       - Pada thead tabel (`<tr>`), tambahkan kolom header ringkasan saldo awal setelah `Informasi Anggota` dan sebelum `rollingMonths.map(...)`:
         ```tsx
         <th className="py-3 px-3 bg-slate-100/80 border-b border-r border-slate-200 text-center min-w-[120px] font-semibold text-slate-700 text-xs">
           <div>{rollingMonths.length > 0 ? `Saldo Pra ${rollingMonths[0].label}` : 'Saldo Awal'}</div>
           <div className="text-[10px] font-normal text-slate-500">Akumulasi Lampau</div>
         </th>
         ```
       - Pada tbody tabel (`paginatedData.map(row => ...)`), render sel ringkasan saldo awal sebelum sel kolom bulan pertama:
         ```tsx
         <td className="px-3 py-3 bg-slate-50/70 border-b border-r border-slate-200 text-xs select-none" data-testid={`prior-summary-${row.nrp}`}>
           <div className="font-semibold text-slate-700 whitespace-nowrap">W: Rp {Number(row.priorSummary?.wajib || 0).toLocaleString('id-ID')}</div>
           <div className="text-slate-500 whitespace-nowrap">B: Rp {Number(row.priorSummary?.belanja || 0).toLocaleString('id-ID')}</div>
           <div className="text-slate-500 whitespace-nowrap">L: Rp {Number(row.priorSummary?.lebaran || 0).toLocaleString('id-ID')}</div>
         </td>
         ```
       - Sesuaikan `colSpan` pada baris loading dan baris data kosong dari 14 menjadi 15 untuk mengkompensasi penambahan kolom saldo awal.
       - Render 12 kolom bulan hasil `getRolling12MonthRange(endYear, endMonth)` (misal Nov-25 s/d Okt-26) secara utuh.
       - Pastikan total saldo riil pada kartu Kas Riil anggota (`row.netSavings.total`) seimbang dengan penjumlahan Saldo Awal + setoran 12 bulan yang tampil.
    2. Perbarui pengujian di `src/pages/admin/ComplianceMatrix.test.tsx`:
       - Tambahkan verifikasi elemen `data-testid="prior-summary-[nrp]"` muncul pada tabel dengan nilai yang sesuai.
       - Pastikan header `Saldo Pra` dan label kolom bergulir dirender dengan benar.
  </action>
  <verify>
    npx vitest run src/pages/admin/ComplianceMatrix.test.tsx
  </verify>
  <done>
    Tabel matriks menampilkan kolom Saldo Awal pra-jendela dan 12 kolom bulan bergulir lintas tahun dengan tata letak yang presisi dan lulus uji unit.
  </done>
</task>

## Success Criteria
- [ ] Kolom header `Saldo Pra [Bln-YY]` atau `Saldo Awal` tampil di tabel.
- [ ] Sel per baris menampilkan rincian ringkas Saldo Awal (W, B, L) sebelum bulan pertama.
- [ ] 12 kolom periode bergulir tampil berurutan (misal Nov-25 s/d Okt-26).
- [ ] Pengujian di `src/pages/admin/ComplianceMatrix.test.tsx` lulus 100%.
