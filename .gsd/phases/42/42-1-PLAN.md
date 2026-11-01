---
phase: 42
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 42.1: Robust As-Is Number Extraction & Sanitization in Excel Migration Parser

## Objective
Menjamin ekstraksi angka murni as-is dari sheet Excel pada `src/services/memberExcelService.ts` untuk seluruh jenis simpanan (pokok, wajib, belanja, lebaran) dan pinjaman dengan sanitasi string/number yang kebal format titik/koma/spasi mata uang, serta bebas dari formula komputasi perkalian atau pembagian durasi.

## Context
- `src/services/memberExcelService.ts` (helper `parseNumber`, mapping kolom Excel)

## Tasks

<task type="auto">
  <name>Ensure Robust Raw Numeric Parsing in memberExcelService</name>
  <files>
    src/services/memberExcelService.ts
  </files>
  <action>
    1. Buka `src/services/memberExcelService.ts`.
    2. Perbaiki fungsi `parseNumber` / `parseAmount`:
       ```typescript
       export const parseAmount = (val: unknown): number => {
         if (val === null || val === undefined) return 0;
         if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, val);
         if (typeof val === 'string') {
           // Bersihkan karakter non-numerik kecuali titik dan minus
           // Jika format Indonesia menggunakan titik ribuan (misal "2.000.000"), hapus titik
           let str = val.trim();
           if (!str) return 0;
           // Jika ada format Rupiah seperti "Rp 2.000.000" atau "2.000.000"
           if (str.includes('.') && !str.includes(',')) {
             // Deteksi apakah format ribuan seperti "2.000.000"
             const parts = str.split('.');
             if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
               str = str.replace(/\./g, '');
             }
           } else if (str.includes(',')) {
             // Format dengan koma desimal atau titik ribuan
             str = str.replace(/\./g, '').replace(',', '.');
           }
           const cleaned = str.replace(/[^0-9.-]+/g, '');
           const num = parseFloat(cleaned);
           return isNaN(num) ? 0 : Math.max(0, num);
         }
         return 0;
       };
       ```
    3. Pastikan kolom-kolom berikut membaca angka murni tanpa rumus:
       - `jumlah_simpanan_pokok = parseAmount(getVal('jumlah_simpanan_pokok'))`
       - `jumlah_simpanan_wajib = parseAmount(getVal('jumlah_simpanan_wajib'))`
       - `jumlah_simpanan_belanja = parseAmount(getVal('jumlah_simpanan_belanja'))`
       - `jumlah_simpanan_lebaran = parseAmount(getVal('jumlah_simpanan_lebaran'))`
       - `jumlah_pinjaman = parseAmount(getVal('jumlah_pinjaman'))`
       - `sisa_pinjaman = parseAmount(getVal('sisa_pinjaman'))`
       - `wajib_per_bulan = jumlah_simpanan_wajib` (utuh apa adanya)
  </action>
  <verify>
    Parser mampu menangani nilai baik bertipe number asli Excel (`2000000`) maupun string (`"2.000.000"` atau `"Rp 2.000.000"`), menghasilkan nominal integer utuh tanpa komputasi durasi.
  </verify>
  <done>Parser menghasilkan data murni as-is yang tahan terhadap berbagai format input.</done>
</task>
