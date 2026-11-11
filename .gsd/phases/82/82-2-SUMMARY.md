# Summary 82.2: Add Minimum THP Configuration Box in Pengaturan Page

## Accomplished
- Menambahkan kartu konfigurasi khusus **"Kebijakan Kelayakan Pinjaman (Keputusan RAT)"** di `src/pages/admin/PengaturanKoperasi.tsx`:
  - Input interaktif untuk batas minimum sisa gaji (THP) per bulan dengan validasi positif (> Rp 0) dan preview nominal rupiah real-time (`formatRupiah`).
  - Input teks catatan keputusan / nomor SK RAT sebagai dasar hukum referensi audit kepatuhan.
  - Tombol simpan kebijakan dengan status loading spinner dan integrasi notifikasi toast via `useFeedback`.
  - Sinkronisasi otomatis saat komponen dimuat melalui pemanggilan `getLoanSettings()` dan penyimpanan persisten via `updateLoanSettings()`.
- Menambahkan unit test di `src/pages/admin/PengaturanKoperasi.test.tsx`:
  - Menguji render kartu kebijakan kelayakan pinjaman beserta label, input, badge preview rupiah, dan banner bantuan validasi otomatis.
  - Menguji nilai awal kustom untuk batas minimum THP dan catatan RAT.
  - Menguji integrasi kontrak layanan `settingsService.getLoanSettings` dan `settingsService.updateLoanSettings`.
- Verifikasi lengkap:
  - 16 tes di `src/pages/admin/PengaturanKoperasi.test.tsx` 100% lulus.
  - Seluruh 65 berkas tes (937 tes unit) di proyek 100% lulus tanpa regresi.
  - `npx tsc --noEmit` exit code 0 (tanpa error tipe).
  - `npm run build` sukses membuat artefak produksi Vite.

## Verification Evidence
- `npx vitest run src/pages/admin/PengaturanKoperasi.test.tsx`: 16 passed (16)
- `npx vitest run`: 65 test files passed, 937 tests passed
- `npx tsc --noEmit`: 0 errors
- `npm run build`: built in 1.13s
