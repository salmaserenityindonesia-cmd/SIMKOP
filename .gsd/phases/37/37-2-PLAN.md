---
phase: 37
plan: 2
wave: 2
depends_on: [37-1]
gap_closure: false
---

# Plan 37.2: Static Verification, Test Suite & Production Build

## Objective
Melakukan verifikasi menyeluruh terhadap tipe data TypeScript, memastikan tidak ada regresi pada seluruh unit test Vitest (185+ passing), dan memastikan build produksi bundler Vite berjalan sukses tanpa error (exit code 0).

## Context
Load these files for context:
- `.gsd/phases/37/37-1-PLAN.md`
- `src/pages/admin/ManajemenReturPembelian.tsx`
- `package.json`

## Tasks

<task type="auto">
  <name>TypeScript Type Check & Vitest Test Suite</name>
  <files>
    src/pages/admin/ManajemenReturPembelian.tsx
  </files>
  <action>
    1. Jalankan `npm run typecheck` (`tsc --noEmit`) untuk memastikan tidak ada kesalahan ketik atau tipe data pada berkas yang dimodifikasi.
    2. Jalankan seluruh suite pengujian otomatis: `npx vitest run`.
    3. Pastikan minimal 185 tes lulus 100% tanpa ada kegagalan.
  </action>
  <verify>npm run typecheck; npx vitest run</verify>
  <done>Kompilasi TypeScript bersih (exit code 0) dan seluruh rangkaian pengujian Vitest lulus 100%.</done>
</task>

<task type="auto">
  <name>Vite Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan perintah kompilasi dan bundling produksi: `npm run build`.
    2. Pastikan proses bundling selesai dengan sukses (exit code 0).
  </action>
  <verify>npm run build; echo "exit=$LASTEXITCODE"</verify>
  <done>Bundler Vite menghasilkan output build produksi yang bersih tanpa error kompilasi.</done>
</task>

## Success Criteria
- [x] `tsc --noEmit` exit code 0.
- [x] Seluruh unit test Vitest lulus (0 failed).
- [x] `npm run build` selesai dengan exit code 0.

