---
phase: 43
plan: 3
wave: 3
depends_on: ["43.1", "43.2"]
gap_closure: false
---

# Plan 43.3: Unit Testing Exact Overwrite, Static Typecheck & Build Verification

## Objective
Menulis unit test komprehensif untuk memvalidasi penghapusan mutasi lama dengan pola `.or()` / case-insensitive filter, memastikan modal snapshot membaca saldo terbaru, memvalidasi keamanan tipe (`tsc --noEmit`), serta memastikan bundling produksi Vite (`npm run build`) berhasil dengan exit code 0.

## Context
- `src/services/memberExcelService.test.ts`
- `src/components/members/MemberMigrationDetailModal.test.tsx`

## Tasks

<task type="auto">
  <name>Unit Test Exact Overwrite and Verify Production Build</name>
  <files>
    src/services/memberExcelService.test.ts
    src/components/members/MemberMigrationDetailModal.test.tsx
  </files>
  <action>
    1. Perbarui pengujian unit di `src/services/memberExcelService.test.ts`:
       - Uji skenario re-import data yang sama dengan nilai berbeda (misal re-import Joko Ramadhan dengan pokok 10.000):
         * Pastikan query delete dengan filter pola migrasi terpanggil.
         * Pastikan nilai baru tersimpan dengan deskripsi `'Saldo Awal Migrasi Sistem'`.
    2. Jalankan `npx vitest run` untuk memastikan seluruh suite test lulus 100%.
    3. Jalankan `npx tsc --noEmit` untuk pengecekan tipe.
    4. Jalankan `npm run build` untuk memvalidasi kelulusan bundler produksi.
  </action>
  <verify>
    - Vitest exit code 0.
    - TypeScript compiler exit code 0.
    - Vite build exit code 0.
  </verify>
  <done>Fitur terverifikasi bersih dan siap pakai.</done>
</task>
