---
phase: 64
plan: 1
wave: 1
gap_closure: false
---

# Plan 64.1: Relocate Action Buttons to Filter Toolbar Row

## Objective
Memindahkan kelompok tombol aksi utama Matriks Pinjaman (`[☑ Centang Semua s/d Bulan Ini]`, `[🔄 Cocokkan Otomatis dengan Saldo Terangsur]`, dan `[📥 Export Excel]`) dari header atas halaman ke dalam bilah kontrol filter dan pencarian di `src/pages/admin/LoanMatrix.tsx`.
Tata letak yang baru akan:
1. Membersihkan header atas sehingga hanya menampilkan judul dan breadcrumb navigasi.
2. Memosisikan ketiga tombol aksi pada bilah kontrol filter tabel, sejajar di antara dropdown filter status dan pemilih tahun.
3. Menjaga seluruh interaktivitas, handler aksi, status loading/disabled, styling responsif, dan atribut `data-testid` tanpa ada regresi fungsionalitas.
4. Memperbarui atau menambahkan unit test komponen di `src/pages/admin/LoanMatrix.test.tsx` untuk memastikan keberadaan ketiga tombol di dalam toolbar filter.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/pages/admin/LoanMatrix.tsx
- src/pages/admin/LoanMatrix.test.tsx

## Tasks

<task type="auto">
  <name>Move Action Buttons into Filter Controls Container</name>
  <files>
    src/pages/admin/LoanMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.tsx`:
       - Pada bagian header (`{/* Header */}`):
         Hapus pembungkus tombol aksi `<div className="flex flex-wrap items-center gap-3">...</div>` sehingga header hanya berisi judul halaman "Matriks Proyeksi & Kepatuhan Pinjaman" dan teks breadcrumb.
       - Pada bagian bilah filter (`{/* Filter Toolbar */}`):
         - Tata ulang container toolbar filter agar menggunakan tata letak flex yang responsif (`flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center`).
         - Bagian kiri menampung input pencarian (`Search`) dan dropdown filter status (`Filter`).
         - Bagian kanan menampung kelompok 3 tombol aksi:
           a. Tombol `[Centang Semua s/d Bulan Ini]` (`data-testid="bulk-check-all-btn"`),
           b. Tombol `[Cocokkan Otomatis dengan Saldo Terangsur]` (`data-testid="bulk-reconcile-btn"`),
           c. Tombol `[Export Excel]` (`data-testid="export-excel-btn"`),
           serta pemilih tahun (`Tahun: [select year]`) dengan separator visual yang rapi.
         - Pertahankan seluruh atribut testid, handler `onClick`, state disabled (`isProcessingBulk`, `isBulkChecking`, `isBulkReconciling`, `isReconcilingLoans`), icon, dan teks label tombol.
  </action>
  <verify>
    Jalankan pengujian komponen:
    `npx vitest run src/pages/admin/LoanMatrix.test.tsx`
  </verify>
  <done>
    Ketiga tombol aksi berhasil dipindahkan dari header ke baris toolbar filter dan pencarian dengan rapi dan responsif.
  </done>
</task>

<task type="auto">
  <name>Update LoanMatrix Component Tests</name>
  <files>
    src/pages/admin/LoanMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.test.tsx`:
       - Tambahkan atau perbarui pengujian yang memverifikasi bahwa:
         - Header halaman tidak lagi merender tombol aksi bulk atau export.
         - Kontainer filter toolbar merender pencarian, status filter, tombol `bulk-check-all-btn`, `bulk-reconcile-btn`, `export-excel-btn`, dan pemilih tahun secara utuh.
         - Semua fungsi trigger klik tetap beroperasi sesuai ekspektasi.
  </action>
  <verify>
    `npx vitest run src/pages/admin/LoanMatrix.test.tsx` lulus 100%.
  </verify>
  <done>
    Unit & component test suite memvalidasi relokasi tombol aksi dengan tepat.
  </done>
</task>

## Success Criteria
- [ ] Header halaman Matriks Proyeksi & Kepatuhan Pinjaman bersih dari tombol aksi.
- [ ] Ketiga tombol aksi (`bulk-check-all-btn`, `bulk-reconcile-btn`, `export-excel-btn`) berada di baris filter bersama pencarian dan pemilih tahun.
- [ ] Seluruh atribut `data-testid`, state loading/disabled, dan handler aksi tetap berfungsi normal.
- [ ] Pengujian di `src/pages/admin/LoanMatrix.test.tsx` lulus 100%.

