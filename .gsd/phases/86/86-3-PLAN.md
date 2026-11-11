---
phase: 86
plan: 3
wave: 3
gap_closure: false
---

# Plan 86.3: Static Verification, Full Test Suite, and Production Build

## Objective
Melakukan verifikasi komprehensif terhadap seluruh basis kode untuk memastikan tidak ada regresi tipe TypeScript, seluruh rangkaian pengujian unit Vitest lulus 100%, serta bundling build produksi Vite berhasil tuntas tanpa error.

## Context
Load these files for context:
- src/services/withdrawalReportService.ts
- src/pages/admin/LaporanPenarikanSimpanan.tsx

## Tasks

<task type="auto">
  <name>Run TypeScript Type Check, Vitest Suite, and Vite Production Build</name>
  <files>src/services/withdrawalReportService.ts, src/pages/admin/LaporanPenarikanSimpanan.tsx</files>
  <action>
    - Jalankan validasi statis TypeScript: `npx tsc --noEmit`.
    - Jalankan seluruh rangkaian test Vitest: `npx vitest run`.
    - Jalankan kompilasi produksi Vite: `npm run build`.
    - Pastikan semua perintah keluar dengan exit code 0 tanpa error.
  </action>
  <verify>
    Kompilasi build berhasil (`npm run build`), type check valid, dan Vitest suite lulus 100%.
  </verify>
</task>

