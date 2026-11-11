---
phase: 88
plan: 3
wave: 3
gap_closure: false
---

# Plan 88.3: Comprehensive Unit Testing, Static Analysis & Build Verification

## Objective
Menulis suite unit test komprehensif untuk menguji logika conditional POKOK injection pada template generator dan parser batch update, menjalankan validasi tipe statis TypeScript tanpa error (`tsc --noEmit`), serta memastikan bundling produksi Vite (`npm run build`) sukses exit code 0.

## Context
- `src/services/batchUpdateService.ts`
- `src/services/batchUpdateService.test.ts`
- `src/pages/admin/BatchUpdater.tsx`

## Tasks

<task type="auto">
  <name>Create Comprehensive Unit Tests for Batch Update Service</name>
  <files>
    src/services/batchUpdateService.test.ts
  </files>
  <action>
    1. Buat file `src/services/batchUpdateService.test.ts`.
    2. Tulis skenario pengujian unit untuk:
       - Pembuatan baris template simpanan (`buildSavingsTemplateRows` / `generateSavingsBatchTemplate`):
         * Anggota dengan simpanan pokok sudah lunas: Hanya menghasilkan 3 baris (WAJIB, LEBARAN, BELANJA).
         * Anggota dengan simpanan pokok belum lunas: Menghasilkan 4 baris (WAJIB, LEBARAN, BELANJA, dan POKOK).
         * Kolom `Telah Dibayar` dan `Jumlah Bayar` untuk baris POKOK menghitung sisa kekurangan dengan tepat.
       - Parsing file batch Excel (`parseBatchUpdateFile`):
         * Baris dengan jenis POKOK diparsing dengan status `READY`.
         * Penanganan anggota tanpa akun member_deposit POKOK yang sudah ada.
       - Eksekusi batch update (`executeBatchUpdate`):
         * Menangani baris POKOK dan menyisipkan transaksi setoran dengan parameter yang sesuai.
    3. Jalankan pengujian unit dengan Vitest:
       `npx vitest run src/services/batchUpdateService.test.ts`
  </action>
  <verify>
    Seluruh pengujian unit pada `batchUpdateService.test.ts` berhasil lulus 100%.
  </verify>
  <done>
    Unit test memverifikasi seluruh skenario kondisional Simpanan Pokok dengan akurat.
  </done>
</task>

<task type="auto">
  <name>Static Typecheck, Full Test Suite & Production Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan pemeriksaan tipe statis TypeScript:
       `npx tsc --noEmit`
    2. Jalankan seluruh unit test suite proyek:
       `npx vitest run`
    3. Jalankan kompilasi build produksi Vite:
       `npm run build`
    4. Pastikan tidak ada regresi dan semua perintah selesai dengan exit code 0.
  </action>
  <verify>
    TypeScript tsc, Vitest test suite, dan Vite build sukses tanpa warning atau error fatal.
  </verify>
  <done>
    Fitur penambahan baris simpanan pokok bersyarat terverifikasi bersih dan siap produksi.
  </done>
</task>

## Success Criteria
- [ ] File unit test `src/services/batchUpdateService.test.ts` lulus 100%.
- [ ] `npx tsc --noEmit` exit code 0 tanpa error tipe TypeScript.
- [ ] `npm run build` berhasil menghasilkan bundle produksi di `dist/` tanpa error.
