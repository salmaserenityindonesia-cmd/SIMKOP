---
phase: 55
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 55.1: Enforce whitespace-nowrap and Expand Member Column Width

## Objective
Merapikan tata letak kartu ringkasan Kas Riil Anggota pada kolom Informasi Anggota di halaman Matriks Tracking Pembayaran Simpanan Tahunan (`src/pages/admin/ComplianceMatrix.tsx`) agar tidak mengalami pemisahan/line-wrapping antara simbol "Rp" dan angka nominal mata uang, menetapkan lebar minimum kolom `min-w-[260px]`, dan menggunakan perataan tipografi angka tabular (`tabular-nums`), serta memperbarui pengujian komponen pada `src/pages/admin/ComplianceMatrix.test.tsx`.

## Context
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/pages/admin/ComplianceMatrix.test.tsx`
- `.gsd/phases/55/RESEARCH.md`

## Tasks

<task type="auto">
  <name>Enforce whitespace-nowrap and Expand Member Column Width</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`.
    2. Pada header kolom `<th>` "Informasi Anggota":
       - Pastikan memiliki atribut lebar kolom yang stabil: `min-w-[260px] w-64 md:w-[280px] shrink-0`.
    3. Pada sel baris tabel `<td>` kolom "Informasi Anggota":
       - Tambahkan kelas lebar yang sama dengan header: `min-w-[260px] w-64 md:w-[280px] shrink-0`.
    4. Perbarui kontainer kartu ringkasan Kas Riil di bawah nama anggota dan badge status pokok:
       - Tetapkan atribut `data-testid={`member-net-savings-${row.nrp}`}`.
       - Tambahkan kelas `whitespace-nowrap` dan `text-[11px]`.
       - Render badge header Total Kas Riil dengan latar emerald halus (`bg-emerald-50/70 border border-emerald-200/60 text-emerald-900`) dan label `Kas Riil`.
       - Render nominal total dengan `font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap`.
       - Render rincian simpanan (Wajib, Belanja, Lebaran) dengan format label abu-abu dan nominal `font-semibold text-slate-800 tabular-nums whitespace-nowrap`.
       - Pastikan tabel utama tetap memiliki wrapper dengan `overflow-x-auto` agar kolom bulan (Jan - Des) dapat digeser mulus tanpa mendesak kolom Informasi Anggota.
    5. Buka `src/pages/admin/ComplianceMatrix.test.tsx`:
       - Sesuaikan assertion text yang sebelumnya memeriksa `'Kas Riil Anggota'` menjadi `'Kas Riil'`.
       - Pastikan seluruh test case (35/35) di `ComplianceMatrix.test.tsx` lulus 100%.
  </action>
  <verify>
    npx vitest run src/pages/admin/ComplianceMatrix.test.tsx
  </verify>
  <done>
    Tampilan kartu kas riil anggota rapi, simetris, dan bebas dari pemotongan teks nominal uang. Seluruh test case pada ComplianceMatrix.test.tsx lulus tanpa error.
  </done>
</task>

## Success Criteria
- [ ] Kolom Informasi Anggota memiliki lebar konsisten `min-w-[260px] w-64 md:w-[280px] shrink-0` pada `<th>` dan `<td>`.
- [ ] Angka nominal kas riil dan rincian simpanan tidak terpotong atau terlipat (`whitespace-nowrap`).
- [ ] Digit angka menggunakan perataan tabular (`tabular-nums`).
- [ ] Unit test `src/pages/admin/ComplianceMatrix.test.tsx` lolos 100%.
