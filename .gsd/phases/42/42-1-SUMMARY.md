# Plan 42.1 Summary: Robust As-Is Number Extraction & Sanitization in Excel Migration Parser

## Objectives Achieved
1. **Helper `parseAmount` & `parseNumber`**:
   - Menangani tipe number murni (`typeof val === 'number'`) secara aman dengan perlindungan terhadap `NaN` dan angka negatif (`Math.max(0, val)`).
   - Menangani tipe string baik dengan pemisah ribuan titik Indonesia (`"2.000.000"`), awalan mata uang (`"Rp 2.000.000"`, `"Rp. 50.000"`), koma desimal Indonesia (`"2.000.000,00"`, `"50000,50"`), maupun format standar internasional (`"2,000,000"`, `"1,500,000.00"`).
   - Fallback anggun ke `0` untuk input kosong, string non-numerik, `null`, atau `undefined`.
   - Mengekspor `parseAmount` dan alias backward-compatible `parseNumber = parseAmount`.

2. **Ekstraksi Kolom Excel As-Is**:
   - Seluruh kolom moneter simpanan dan pinjaman (`jumlah_simpanan_pokok`, `jumlah_simpanan_wajib`, `jumlah_simpanan_belanja`, `jumlah_simpanan_lebaran`, `jumlah_pinjaman`, `sisa_pinjaman`) kini diekstraksi menggunakan `parseAmount`.
   - Kolom `tenor` diekstraksi menggunakan `Math.max(0, Math.floor(parseAmount(getVal('tenor'))))` sehingga tahan terhadap format string seperti `"24 bulan"`.
   - `wajib_per_bulan = jumlah_simpanan_wajib` tetap utuh as-is tanpa pembagian durasi bulan.

3. **Pengujian Unit & Regresi**:
   - Ditambahkan unit test menyeluruh untuk `parseAmount` dan `parseNumber` yang memvalidasi berbagai skenario tipe data dan format string mata uang.
   - Ditambahkan skenario integrasi parsing file Excel pada `src/services/memberExcelService.test.ts` yang menguji baris dengan input string currency dan teks tenor.
   - Seluruh 18 tes pada `src/services/memberExcelService.test.ts` lolos 100%.
   - Seluruh test suite (25 test files, 243 tests) lolos 100%.
   - Typecheck TypeScript (`tsc --noEmit`) dan production build (`npm run build`) berhasil tanpa error.

## Files Touched
- `src/services/memberExcelService.ts`
- `src/services/memberExcelService.test.ts`

## Verification Evidence
- Vitest suite: `npx vitest run src/services/memberExcelService.test.ts` -> 18/18 tests passed.
- Full project test suite: `npm test` -> 25/25 files passed, 243/243 tests passed.
- Typecheck: `npx tsc --noEmit` -> Exit code 0.
- Production build: `npm run build` -> Exit code 0.
