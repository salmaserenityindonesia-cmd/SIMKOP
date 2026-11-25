---
phase: 97
plan: 4
wave: 3
gap_closure: false
depends_on:
  - 97-1
  - 97-2
  - 97-3
---

# Plan 97.4: Verifikasi Terpadu (Unit Tests, TypeCheck & Build Produksi)

## Objective
Memverifikasi seluruh perubahan Wave 1 dan Wave 2 berjalan selaras tanpa regresi tipe TypeScript, error build Vite, atau kegagalan test di modul impor pinjaman, laporan pinjaman lunas, audit orphan, dan laporan keuangan SHU.

## Context
- `.gsd/SPEC.md`
- `src/services/loanService.ts`
- `src/services/paidOffLoansReportService.ts`
- `src/pages/admin/laporan-keuangan/index.tsx`

## Tasks

<task type="auto">
  <name>Run Full Targeted Vitest Suite, TypeScript Check, and Production Vite Build</name>
  <files>
    src/services/loanService.ts
    src/services/paidOffLoansReportService.ts
    src/pages/admin/laporan-keuangan/index.tsx
  </files>
  <action>
    1. Jalankan suite unit test Vitest untuk seluruh area terdampak:
       `npx vitest run src/utils/initialLoansParser.test.ts src/services/loanService.test.ts src/pages/admin/LaporanPinjamanLunas.test.tsx src/pages/admin/laporan-keuangan/index.test.tsx src/services/orphanAuditService.test.ts`
    2. Jalankan pemeriksaan tipe TypeScript ketat:
       `npx tsc --noEmit`
    3. Jalankan build produksi Vite:
       `npm run build`
    4. Jika ada kegagalan pada langkah 1–3, perbaiki akar penyebabnya sebelum menandai selesai.
  </action>
  <verify>
    `npx vitest run src/utils/initialLoansParser.test.ts src/services/loanService.test.ts src/pages/admin/LaporanPinjamanLunas.test.tsx src/pages/admin/laporan-keuangan/index.test.tsx src/services/orphanAuditService.test.ts && npx tsc --noEmit && npm run build`
  </verify>
  <done>
    Semua suite test lulus 100%, `npx tsc --noEmit` exit code 0, dan `npm run build` exit code 0.
  </done>
</task>

## Must-Haves
- [ ] Zero TypeScript errors (`npx tsc --noEmit`).
- [ ] Production build sukses (`npm run build`).
- [ ] Seluruh unit test terdampak lulus tanpa skip atau relaksasi assertion.

## Success Criteria
- [ ] Exit code 0 untuk seluruh rangkaian verifikasi.
