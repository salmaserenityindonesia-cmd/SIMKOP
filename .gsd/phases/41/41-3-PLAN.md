---
phase: 41
plan: 3
wave: 3
depends_on: ["41.1", "41.2"]
gap_closure: false
---

# Plan 41.3: Static Verification, Unit Testing & Production Build

## Objective
Menjalankan pengujian komponen, memastikan type safety dengan TypeScript compiler (`tsc --noEmit`), serta memastikan bundling produksi Vite (`npm run build`) sukses tanpa error (exit code 0).

## Context
- `src/pages/admin/ManajemenAnggota.tsx`
- `src/components/members/MemberMigrationDetailModal.tsx`

## Tasks

<task type="auto">
  <name>Verify Component Tests, Typecheck, and Production Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan `npx vitest run` untuk memverifikasi seluruh suite pengujian unit berjalan 100% lulus.
    2. Jalankan `npx tsc --noEmit` untuk memastikan tidak ada kesalahan tipe TypeScript pada komponen baru.
    3. Jalankan `npm run build` untuk memverifikasi kelulusan bundling produksi Vite.
  </action>
  <verify>
    - Vitest exit code 0.
    - TypeScript compiler exit code 0.
    - Vite build exit code 0.
  </verify>
  <done>Fitur aman dan siap dirilis.</done>
</task>
