# Plan 82.3: Bind Dynamic Threshold to Pengajuan Pinjaman & Full Verification

## Objective
Mengintegrasikan ambang batas dinamis ke dalam halaman formulir pengajuan pinjaman (`src/pages/admin/PengajuanPinjaman.tsx`), memperbarui panel simulasi kelayakan, dan menjalankan verifikasi komprehensif sistem:
1. Memuat `minRemainingThp` dinamis via `getLoanSettings()` saat komponen `PengajuanPinjaman.tsx` dimuat.
2. Menggantikan seluruh referensi statis `MIN_REMAINING_THP` (1.500.000) pada:
   - Evaluasi kelayakan `calculateTHPEligibility(..., minRemainingThp)`.
   - Algoritma pencarian tenor rekomendasi (`recommendedTenor`).
   - Teks kotak status hijau (Memenuhi Syarat): `berada di atas batas minimum Rp {formatCurrency(minRemainingThp)}`.
   - Teks kotak status merah (Tidak Memenuhi Syarat): selisih kekurangan terhadap `minRemainingThp`.
   - Validasi disable tombol `Ajukan Pinjaman` dan submit handler.
3. Memperbarui atau menambahkan pengujian unit di `src/pages/admin/PengajuanPinjaman.test.tsx` untuk memverifikasi kelayakan terhadap batas minimum dinamis (misal: diuji pada batas 2.000.000 dan 1.750.000).
4. Menjalankan static typecheck (`npx tsc --noEmit`), full test suite Vitest (`npm test`), dan build bundler (`npm run build`).

## Tasks
<task type="auto">
  <name>Bind Dynamic Threshold to Loan Application Simulation and Submission</name>
  <files>src/pages/admin/PengajuanPinjaman.tsx, src/pages/admin/PengajuanPinjaman.test.tsx</files>
  <action>
    - Buka `src/pages/admin/PengajuanPinjaman.tsx`:
      1. Tambahkan state `const [minRemainingThp, setMinRemainingThp] = useState<number>(MIN_REMAINING_THP);`.
      2. Panggil `getLoanSettings()` saat mount untuk mengupdate `setMinRemainingThp`.
      3. Operkan `minRemainingThp` ke `calculateTHPEligibility` dan komponen `LoanSimulationPanel`.
      4. Perbarui pesan pada kotak hijau dan merah agar menggunakan nilai dinamis tersebut.
      5. Sesuaikan helper rekomendasi tenor agar membandingkan sisa THP terhadap `minRemainingThp`.
    - Di `src/pages/admin/PengajuanPinjaman.test.tsx`:
      Pastikan tes mencakup skenario evaluasi kelayakan dengan nilai batas THP kustom.
  </action>
  <verify>`npx vitest run src/pages/admin/PengajuanPinjaman.test.tsx` lulus 100%.</verify>
  <done>Simulasi kelayakan dan validasi pengajuan pinjaman 100% dinamis mengikuti pengaturan RAT.</done>
</task>

<task type="auto">
  <name>Static Typecheck and Production Build Verification</name>
  <files>src/</files>
  <action>
    - Jalankan `npx tsc --noEmit` untuk memastikan tidak ada kesalahan tipe TypeScript.
    - Jalankan `npm test` untuk memastikan seluruh 65+ file tes lulus.
    - Jalankan `npm run build` untuk memverifikasi proses build Vite.
  </action>
  <verify>`npm test` dan `npm run build` selesai dengan exit code 0.</verify>
  <done>Seluruh perubahan terintegrasi bersih tanpa regresi dan siap rilis ke produksi.</done>
</task>

