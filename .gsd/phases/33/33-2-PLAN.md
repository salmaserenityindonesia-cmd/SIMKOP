---
phase: 33
plan: 2
wave: 2
gap_closure: false
---

# Plan 33.2: Static Verification & Build Integrity

## Objective
Memverifikasi tidak adanya regresi tipe TypeScript, unit test breakage, atau masalah bundling Vite akibat pemindahan urutan kelompok navigasi menu sidebar.

## Context
Load these files for context:
- src/components/layout/Sidebar.tsx
- src/components/layout/AdminSidebar.tsx

## Tasks

<task type="auto">
  <name>Static Type Checking, Test Suite & Vite Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan unit test suite Vitest: `npx vitest run`.
    2. Jalankan validasi tipe TypeScript dan build bundler: `npm run build`.
    3. Pastikan tidak ada warning atau error baru yang muncul.
  </action>
  <verify>
    - `npx vitest run` selesai dengan exit code 0 (seluruh suite test lulus).
    - `npm run build` selesai dengan exit code 0 tanpa error kompilasi.
  </verify>
  <done>
    Perubahan tata letak menu navigasi terverifikasi bersih dan siap digunakan.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] TypeScript check and production build (`npm run build`) exit code 0.
- [ ] All unit tests pass (`npx vitest run`).

## Success Criteria
- [ ] All tasks verified passing
- [ ] Zero build warnings / errors
