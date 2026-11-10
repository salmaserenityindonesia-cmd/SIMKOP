# Phase 76 Plan 2: UI Form Field Integration & Submission Payload Binding Summary

## Executive Summary
Implementasi Plan 76.2 berhasil diselesaikan secara utuh. Form pengajuan pinjaman baru (`PengajuanPinjaman.tsx`) kini telah mengintegrasikan elemen antarmuka dropdown "Jenis Pinjaman" berbasis data master aktif, dropdown "Tenor (Bulan)" yang terhubung secara reaktif dengan batasan durasi tenor jenis pinjaman terpilih dan berstatus terdisabilitas sebelum jenis pinjaman dipilih, serta validasi ketat submit dan pengikatan field `loan_type_id` pada payload pembuatan pinjaman.

## Key Changes
1. **`src/pages/admin/PengajuanPinjaman.tsx`**:
   - Menambahkan field dropdown "Jenis Pinjaman" pada formulir pengajuan pinjaman (diletakkan tepat setelah "Anggota Pemohon"):
     - Menggunakan `selectedLoanTypeId` dan memanggil `handleLoanTypeChange(e.target.value)`.
     - Menampilkan label nama jenis pinjaman beserta informasi batas maksimal tenor `(Maks. {lt.max_duration_months} Bulan)`.
   - Memperbarui elemen dropdown "Tenor (Bulan)":
     - Merender opsi dinamis berdasarkan `availableTenors` (hasil perhitungan `calculateAvailableTenors(selectedLoanType?.max_duration_months)`).
     - Menambahkan atribut `disabled={!selectedLoanTypeId}` dengan styling visual `disabled:bg-gray-100 disabled:text-gray-400`.
     - Menampilkan placeholder kontekstual: `'-- Pilih Jenis Pinjaman Terlebih Dahulu --'` jika belum memilih jenis pinjaman, atau `'-- Pilih Tenor --'` jika jenis pinjaman telah dipilih.
   - Memperketat validasi pengajuan pada handler `handleSubmit`:
     - Memastikan `selectedLoanTypeId` telah terisi sebelum pengajuan diproses.
     - Memvalidasi batas tenor `Number(tenor) <= maxTenor`, menampilkan pesan error jika tenor melebihi batas durasi produk.
     - Mengirimkan `selectedLoanTypeId` ke service `loanService.applyLoan(selectedAnggota, purpose, Number(amount), Number(tenor), selectedLoanTypeId)`.
     - Mereset `selectedLoanTypeId` bersama form state lainnya (`purpose`, `amount`, `tenor`) setelah pengajuan berhasil disubmit.
   - Memperbarui proteksi tombol submit:
     - Menambahkan kondisi `!selectedLoanTypeId` pada atribut `disabled` tombol submit sehingga pengguna tidak dapat mengklik pengajuan sebelum jenis pinjaman ditentukan.

## Verification Evidence
- `npx tsc --noEmit`: 0 error tipe, static check lolos sempurna.
- `npm test src/pages/admin/PengajuanPinjaman.test.tsx`: 20/20 pengujian unit lolos.
- `npm test`: 852/852 pengujian di seluruh 61 test files lolos 100%.

## Commits Landed
- `c0109da8`: `feat(phase-76): add jenis pinjaman field and connect dynamic tenor options in form`
- `d84ea9b8`: `feat(phase-76): enforce validation and bind loan_type_id in submission payload`
