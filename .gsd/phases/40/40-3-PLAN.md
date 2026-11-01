---
phase: 40
plan: 3
wave: 3
depends_on: ["40.1", "40.2"]
gap_closure: false
---

# Plan 40.3: Static Verification, Unit Testing & Production Build

## Objective
Memperbarui suite unit test untuk memvalidasi pemetaan as-is tanpa rumus di `memberExcelService.test.ts`, memverifikasi type safety via `tsc --noEmit`, dan memastikan bundling produksi Vite (`npm run build`) berhasil 100% tanpa error.

## Context
- `src/services/memberExcelService.test.ts`
- `src/components/members/MemberMigrationModal.tsx`

## Tasks

<task type="auto">
  <name>Update Unit Tests and Verify Production Build</name>
  <files>
    src/services/memberExcelService.test.ts
  </files>
  <action>
    1. Perbarui `src/services/memberExcelService.test.ts` untuk memastikan fungsi pengujian mencakup penanganan raw values untuk `tgl_awal_pinjaman` (angka/string) dan saldo simpanan wajib utuh.
    2. Jalankan `npx vitest run` untuk memverifikasi seluruh test suite lulus (exit code 0).
    3. Jalankan `npm run build` untuk memvalidasi kelulusan bundler Vite.
  </action>
  <verify>
    - Vitest exit code 0.
    - `npm run build` exit code 0 tanpa error tipe.
  </verify>
  <done>Fitur migrasi murni as-is terverifikasi siap pakai.</done>
</task>
