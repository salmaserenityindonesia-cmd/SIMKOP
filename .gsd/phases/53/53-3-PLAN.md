---
phase: 53
plan: 3
wave: 3
depends_on:
  - 53.1
  - 53.2
gap_closure: false
---

# Plan 53.3: Toolbar UI Integration in ComplianceMatrix.tsx & Modals

## Objective
Mengintegrasikan tombol aksi ekspor Excel dengan pilihan tipe simpanan dan modal interaktif impor matriks hasil audit pada toolbar `src/pages/admin/ComplianceMatrix.tsx`, lengkap dengan validasi visual, progress bar saat batch insert, serta pengujian komponen di `src/pages/admin/ComplianceMatrix.test.tsx`.

## Context
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/pages/admin/ComplianceMatrix.test.tsx`
- `src/components/compliance/SavingsMatrixImportModal.tsx`
- `src/components/compliance/SavingsMatrixImportModal.test.tsx`
- `src/utils/savingsMatrixExporter.ts`
- `src/utils/savingsMatrixImporter.ts`
- `src/services/complianceService.ts`

## Tasks

<task type="auto">
  <name>Build Savings Matrix Import Modal Component</name>
  <files>
    src/components/compliance/SavingsMatrixImportModal.tsx
    src/components/compliance/SavingsMatrixImportModal.test.tsx
  </files>
  <action>
    1. Buat komponen modal terpisah `src/components/compliance/SavingsMatrixImportModal.tsx`:
       - Props:
         * `isOpen: boolean`
         * `onClose: () => void`
         * `onSuccess: () => void`
         * `defaultType?: 'WAJIB' | 'BELANJA' | 'LEBARAN'`
       - Pilihan jenis simpanan (radio button / pill selector):
         * Simpanan Wajib
         * Simpanan Belanja Bulanan
         * Simpanan Hari Raya (Lebaran)
       - Area unggah berkas drag-and-drop untuk berkas `.xlsx`.
       - Status pembacaan berkas / preview parsing:
         * Menampilkan nama berkas, total baris anggota terdeteksi, total mutasi nominal (> 0) terdeteksi.
         * Menampilkan daftar error jika format berkas tidak valid.
       - Tombol aksi:
         * "Batal"
         * "Mulai Impor & Sinkronkan Buku Besar" (disabled jika belum ada file atau sedang memproses).
       - Tampilan progress bar interaktif selama proses pengiriman data ke database.
       - Notifikasi toast saat impor selesai dan memicu callback `onSuccess`.
    2. Buat pengujian komponen `src/components/compliance/SavingsMatrixImportModal.test.tsx`:
       - Render modal saat `isOpen=true`.
       - Memilih radio jenis simpanan.
       - Menangani pemilihan berkas Excel dan menampilkan ringkasan parsing.
       - Memanggil fungsi impor saat tombol konfirmasi diklik.
  </action>
  <verify>
    npx vitest run src/components/compliance/SavingsMatrixImportModal.test.tsx
  </verify>
  <done>
    Komponen modal impor matriks simpanan selesai dibuat dan teruji.
  </done>
</task>

<task type="auto">
  <name>Integrate Export Dropdown & Import Modal into ComplianceMatrix.tsx</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`.
    2. Tambahkan tombol dropdown **"Ekspor Matriks Periksa (.xlsx)"** pada toolbar atas:
       - Klik tombol membuka menu pilihan:
         * Simpanan Wajib (`exportSavingsMatrixExcel('WAJIB')`)
         * Simpanan Belanja Bulanan (`exportSavingsMatrixExcel('BELANJA')`)
         * Simpanan Hari Raya (`exportSavingsMatrixExcel('LEBARAN')`)
       - Tambahkan feedback toast atau indikator loading saat proses pembuatan lembar kerja berlangsung.
    3. Tambahkan tombol **"Impor Matriks Hasil Audit"** pada toolbar atas:
       - Klik tombol membuka modal `SavingsMatrixImportModal`.
       - Saat impor berhasil (`onSuccess`):
         * Tampilkan toast "Buku besar berhasil disinkronkan dari file Excel".
         * Muat ulang data matriks secara menyeluruh via `fetchComplianceData(year)`.
    4. Perbarui file test `src/pages/admin/ComplianceMatrix.test.tsx` untuk memverifikasi:
       - Render tombol ekspor dan impor pada toolbar.
       - Pembukaan menu dropdown ekspor dan pemanggilan fungsi ekspor.
       - Pembukaan modal impor matriks saat tombol diklik.
  </action>
  <verify>
    npx vitest run src/pages/admin/ComplianceMatrix.test.tsx
  </verify>
  <done>
    Tombol aksi ekspor dan impor matriks terintegrasi di toolbar halaman Compliance Matrix dan lulus pengujian komponen.
  </done>
</task>

## Success Criteria
- [ ] Tombol ekspor matriks per jenis simpanan tersedia dan fungsional di toolbar.
- [ ] Modal impor matriks hasil audit terpasang lengkap dengan pratinjau data dan progress status.
- [ ] Pengujian komponen di `ComplianceMatrix.test.tsx` dan `SavingsMatrixImportModal.test.tsx` lulus 100%.

