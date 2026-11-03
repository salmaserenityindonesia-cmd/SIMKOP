---
phase: 54
plan: 2
wave: 2
depends_on: ["54-1-PLAN.md"]
gap_closure: false
---

# Plan 54.2: Render Real Cash Balance in Member Information Column

## Objective
Mengintegrasikan tampilan kartu ringkas "Kas Riil Anggota" pada kolom pertama ("Informasi Anggota") di halaman `/admin/compliance-matrix` (`src/pages/admin/ComplianceMatrix.tsx`) agar posisi saldo kas riil per jenis simpanan (Wajib, Belanja, Lebaran) dan Total Kas Bersih terpampang transparan di bawah nama anggota dan badge status pokok, serta memperbarui pengujian komponen pada `src/pages/admin/ComplianceMatrix.test.tsx`.

## Context
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/pages/admin/ComplianceMatrix.test.tsx`
- `src/services/complianceService.ts`

## Tasks

<task type="auto">
  <name>Display Net Balance Card Under Member Name</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`.
    2. Pada baris tabel `paginatedData.map((row) => ...)` di kolom pertama `Informasi Anggota` (`<td>`):
       - Tepat di bawah `<div className="flex items-center gap-2 mt-1">` yang memuat NRP dan badge status Pokok, tambahkan kartu ringkas posisi saldo kas riil:
         ```tsx
         <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-0.5 text-[11px] font-mono select-none" data-testid={`member-net-savings-${row.nrp}`}>
           <div className="flex items-center justify-between text-slate-500 font-semibold text-[10px] uppercase">
             <span>Kas Riil Anggota</span>
             <span className="text-emerald-700 font-bold">
               Rp {Number(row.netSavings?.total || 0).toLocaleString('id-ID')}
             </span>
           </div>
           <div className="flex items-center justify-between text-slate-600">
             <span>Wajib:</span>
             <span className="font-semibold text-slate-800">
               Rp {Number(row.netSavings?.wajib || 0).toLocaleString('id-ID')}
             </span>
           </div>
           <div className="flex items-center justify-between text-slate-600">
             <span>Belanja:</span>
             <span className="font-semibold text-slate-800">
               Rp {Number(row.netSavings?.belanja || 0).toLocaleString('id-ID')}
             </span>
           </div>
           <div className="flex items-center justify-between text-slate-600">
             <span>Lebaran:</span>
             <span className="font-semibold text-slate-800">
               Rp {Number(row.netSavings?.lebaran || 0).toLocaleString('id-ID')}
             </span>
           </div>
         </div>
         ```
    3. Pastikan lebar kolom header dan cell tabel `Informasi Anggota` tetap rapi dan tidak mengalami text-overflow atau misalignment (kolom tetap konsisten dengan lebar ~280px).
  </action>
  <verify>
    Periksa rendering di `ComplianceMatrix.tsx` bahwa elemen kartu kas riil anggota terpasang dengan data-testid dan styling Tailwind yang presisi.
  </verify>
  <done>
    Antarmuka matriks kepatuhan kini menyajikan rincian saldo kas bersih riil di bawah setiap nama anggota.
  </done>
</task>

<task type="auto">
  <name>Update Compliance Matrix Component Tests</name>
  <files>
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.test.tsx`.
    2. Perbarui mock data `getComplianceMatrixData` atau komponen test yang relevan untuk menyertakan properti `netSavings` pada data anggota:
       ```typescript
       netSavings: {
         wajib: 500000,
         belanja: 150000,
         lebaran: 300000,
         total: 950000
       }
       ```
    3. Tambahkan test case spesifik:
       - Memverifikasi teks "Kas Riil Anggota" dan angka saldo bersih total (misal `Rp 950.000`), Wajib (`Rp 500.000`), Belanja (`Rp 150.000`), dan Lebaran (`Rp 300.000`) dirender dengan benar di bawah nama anggota.
       - Memastikan kasus ketika `netSavings` bernilai 0 tetap dirender secara aman (`Rp 0`).
    4. Jalankan `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx`.
  </action>
  <verify>
    Jalankan `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx` dan pastikan seluruh test suite lolos.
  </verify>
  <done>
    Pengujian komponen memvalidasi tampilan saldo kas riil secara menyeluruh.
  </done>
</task>
