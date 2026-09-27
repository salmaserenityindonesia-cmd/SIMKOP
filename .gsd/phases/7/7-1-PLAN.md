---
phase: 7
plan: 1
wave: 1
gap_closure: false
---

# Plan 7.1: Export Utility and Master Data Export (Excel & PDF)

## Objective
Implementasi utility export data ke format Excel dan PDF, serta menambahkan fitur export pada halaman data master (Anggota dan Produk).

## Context
Load these files for context:
- .gsd/SPEC.md
- src/lib/exportUtils.ts (will be created)
- src/pages/admin/ManajemenAnggota.tsx
- src/pages/admin/ManajemenProduk.tsx

## Tasks

<task type="auto">
  <name>Install Dependencies & Create Export Utility</name>
  <files>
    package.json
    src/lib/exportUtils.ts
  </files>
  <action>
    Steps:
    1. Install `xlsx` untuk export Excel.
    2. Install `jspdf` dan `jspdf-autotable` untuk export PDF.
    3. Buat file `src/lib/exportUtils.ts` yang berisi dua fungsi:
       - `exportToExcel(data: any[], filename: string)`
       - `exportToPDF(headers: string[], data: any[][], filename: string, title?: string)`
    
    AVOID: Format PDF yang berantakan karena data terlalu panjang.
    USE: `jspdf-autotable` agar format tabel di PDF rapi.
  </action>
  <verify>
    npm ls xlsx jspdf jspdf-autotable
  </verify>
  <done>
    Dependencies berhasil diinstall dan file exportUtils.ts dibuat dengan valid TypeScript.
  </done>
</task>

<task type="auto">
  <name>Add Export Buttons to Master Data</name>
  <files>
    src/pages/admin/ManajemenAnggota.tsx
    src/pages/admin/ManajemenProduk.tsx
  </files>
  <action>
    Steps:
    1. Import `exportToExcel` dan `exportToPDF` dari `src/lib/exportUtils.ts`.
    2. Pada halaman `ManajemenAnggota.tsx`, tambahkan tombol "Export Excel" dan "Export PDF" di area header. Saat diklik, panggil data yang sedang ditampilkan dan export.
    3. Lakukan hal yang sama pada `ManajemenProduk.tsx`.
    
    AVOID: Mengeksport data yang tidak difilter jika ada filter aktif.
    USE: Button dengan style yang konsisten dengan button yang ada (menggunakan komponen Lucide React untuk icon download).
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Aplikasi berhasil dibuild tanpa error, dan tombol export terlihat pada komponen tabel.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] File exportUtils.ts berfungsi menangani data array.
- [ ] Tombol export ada di halaman Manajemen Anggota dan Manajemen Produk.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Build process is successful without type errors.
