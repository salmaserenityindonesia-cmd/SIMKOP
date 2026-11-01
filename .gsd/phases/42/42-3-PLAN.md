---
phase: 42
plan: 3
wave: 3
depends_on: ["42.1", "42.2"]
gap_closure: false
---

# Plan 42.3: Unit Testing Exact Replacement, Static Typecheck & Build Verification

## Objective
Menguji perilaku Timpa Mutlak (Exact Replacement Overwrite) dengan unit test otomatis di `memberExcelService.test.ts`, memverifikasi tidak adanya regresi pada 25 berkas pengujian lainnya, serta memastikan keamanan tipe (`tsc --noEmit`) dan kelulusan build produksi Vite (`npm run build`).

## Context
- `src/services/memberExcelService.test.ts`
- `src/services/memberExcelService.ts`

## Tasks

<task type="auto">
  <name>Test Idempotent Overwrite and Verify Production Build</name>
  <files>
    src/services/memberExcelService.test.ts
  </files>
  <action>
    1. Perbarui `src/services/memberExcelService.test.ts`:
       - Tambahkan unit test untuk `parseAmount` yang menguji sanitasi string ribuan seperti `"2.000.000"`, `"Rp 6.600.000"`, dan angka murni `2000000`.
       - Tambahkan unit test untuk `executeMigration`:
         * Uji bahwa pada pemanggilan kedua (re-import), mutasi migrasi lama dibersihkan (`delete` terpanggil dengan filter deskripsi migrasi) sebelum transaksi baru dimasukkan.
    2. Jalankan `npx vitest run` untuk memastikan seluruh suite test vitest lulus 100%.
    3. Jalankan `npx tsc --noEmit` untuk validasi tipe.
    4. Jalankan `npm run build` untuk memvalidasi kelulusan bundler produksi.
  </action>
  <verify>
    - Vitest exit code 0.
    - TypeScript compiler exit code 0.
    - Vite build exit code 0.
  </verify>
  <done>Fitur Exact Replacement Overwrite teruji penuh dan siap rilis.</done>
</task>
