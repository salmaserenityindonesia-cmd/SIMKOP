---
phase: 35
plan: 2
wave: 2
gap_closure: false
---

# Plan 35.2: Static Verification & Build Integrity

## Objective
Memverifikasi tidak adanya regresi tipe TypeScript, kerusakan pada unit test suite, atau error kompilasi bundler Vite setelah perubahan tata letak tombol header laporan mutasi barang.

## Context
Load these files for context:
- src/pages/admin/LaporanMutasiBarang.tsx

## Tasks

<task type="auto">
  <name>Static Type Checking, Test Suite & Vite Build</name>
  <files>
    src/pages/admin/LaporanMutasiBarang.tsx
  </files>
  <action>
    1. Jalankan unit test suite Vitest: `npx vitest run`.
    2. Jalankan validasi tipe TypeScript dan build bundler: `npm run build`.
    3. Pastikan seluruh test lulus dan build selesai tanpa error.
  </action>
  <verify>
    - `npx vitest run` selesai dengan exit code 0 (seluruh suite test lulus).
    - `npm run build` selesai dengan exit code 0 tanpa error kompilasi.
  </verify>
  <done>
    Seluruh test suite dan production build Vite terverifikasi bersih dengan exit code 0.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [x] TypeScript check and production build (`npm run build`) exit code 0.
- [x] All unit tests pass (`npx vitest run`).

## Success Criteria
- [x] All tasks verified passing
- [x] Zero build warnings / errors

