---
phase: 45
plan: 3
wave: 3
depends_on: ["45.1", "45.2"]
gap_closure: false
---

# Plan 45.3: Connect Toolbar Buttons in ManajemenAnggota

## Objective
Mengintegrasikan fungsi penarikan data komprehensif dan generator ekspor 14 kolom ke dalam tombol Excel dan PDF pada toolbar halaman Manajemen Anggota (`src/pages/admin/ManajemenAnggota.tsx`), menyediakan feedback visual (indikator loading / spinner) saat data besar diproses, serta menampilkan pesan toast konfirmasi keberhasilan ekspor.

## Context
- `src/pages/admin/ManajemenAnggota.tsx`
- `src/services/memberService.ts`
- `src/services/memberExporter.ts`
- `src/services/settingsService.ts`

## Tasks

<task type="auto">
  <name>Bind Comprehensive Exporters to Toolbar Buttons</name>
  <files>
    src/pages/admin/ManajemenAnggota.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ManajemenAnggota.tsx`.
    2. Tambahkan state loading ekspor:
       ```typescript
       const [isExportingExcel, setIsExportingExcel] = useState(false);
       const [isExportingPdf, setIsExportingPdf] = useState(false);
       ```
    3. Perbarui fungsi `handleExportExcel`:
       - Aktifkan `setIsExportingExcel(true)`.
       - Ambil ID anggota yang sedang difilter: `const memberIds = filteredList.map(a => a.id)`.
       - Panggil `getMembersComprehensiveReport(memberIds)`.
       - Panggil `exportMembersToExcel(comprehensiveData)`.
       - Tampilkan toast sukses: `"Laporan Excel 14 kolom berhasil diunduh."`.
       - Tangani error dengan menampilkan toast error.
       - Nonaktifkan `setIsExportingExcel(false)` di block `finally`.
    4. Perbarui fungsi `handleExportPDF`:
       - Aktifkan `setIsExportingPdf(true)`.
       - Ambil ID anggota yang sedang difilter: `const memberIds = filteredList.map(a => a.id)`.
       - Panggil `getMembersComprehensiveReport(memberIds)`.
       - Ambil profil koperasi via `settingsService.getKoperasiProfile()`.
       - Panggil `exportMembersToPdf(comprehensiveData, profile)`.
       - Tampilkan toast sukses: `"Laporan PDF Landscape 14 kolom berhasil diunduh."`.
       - Tangani error dengan menampilkan toast error.
       - Nonaktifkan `setIsExportingPdf(false)` di block `finally`.
    5. Perbarui render tombol toolbar:
       - Tombol **Excel**: jika `isExportingExcel` bernilai true, tampilkan `<Loader2 className="w-4 h-4 animate-spin mr-1.5" />` dan disable tombol.
       - Tombol **PDF**: jika `isExportingPdf` bernilai true, tampilkan `<Loader2 className="w-4 h-4 animate-spin mr-1.5" />` dan disable tombol.
  </action>
  <verify>
    - Mengklik tombol Excel memunculkan spinner sementara data ditarik dan file `.xlsx` 14 kolom terunduh.
    - Mengklik tombol PDF memunculkan spinner sementara data ditarik dan file `.pdf` landscape 14 kolom terunduh.
    - Notifikasi toast sukses muncul setelah download berhasil dimulai.
  </verify>
  <done>
    Toolbar Manajemen Anggota telah terhubung penuh dengan engine ekspor 14 kolom komprehensif.
  </done>
</task>

## Success Criteria
- [ ] Tombol Excel dan PDF di toolbar Manajemen Anggota memicu ekspor 14 kolom
- [ ] Tombol memiliki status loading visual yang mencegah klik ganda
- [ ] Filter pencarian NRP/Nama tetap dihormati (hanya mengekspor anggota yang sesuai filter jika filter aktif, atau semua anggota jika kosong)
- [ ] Toast notification memberikan umpan balik yang jelas kepada pengguna
