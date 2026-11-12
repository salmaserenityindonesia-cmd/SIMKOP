---
phase: 92
plan: 2
wave: 2
gap_closure: false
---

# Plan 92.2: Static Check & Production Build Verification

## Objective
Memastikan tidak ada galat kompilasi TypeScript (`tsc --noEmit`), seluruh test suite lulus, dan build produksi Vite (`npm run build`) berjalan bersih dengan exit code 0.

## Context
- Codebase client
- `src/services/settlementService.test.ts`
- `npm run test`
- `npm run build`

## Tasks

<task type="auto">
  <name>Build and Static Analysis Verification</name>
  <files>
    src/services/settlementService.ts
    src/pages/admin/SettlementClearance.tsx
    src/components/settlement/ClearanceActionModal.tsx
    src/components/settlement/ClearancePrintTemplate.tsx
  </files>
  <action>
    1. Jalankan unit test settlement:
       `npx vitest run src/services/settlementService.test.ts`
    2. Jalankan pemeriksaan tipe statis TypeScript:
       `npx tsc --noEmit`
    3. Jalankan build produksi Vite:
       `npm run build`
    4. Pastikan build selesai dengan status exit code 0 tanpa error.
  </action>
  <verify>
    `npm run build` selesai dengan exit code 0.
  </verify>
</task>

