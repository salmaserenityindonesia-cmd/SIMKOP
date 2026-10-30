---
phase: 38
plan: 3
wave: 3
depends_on: [38-1, 38-2]
gap_closure: false
---

# Plan 38.3: Static Verification, Full Test Suite & Production Build

## Objective
Memvalidasi seluruh perubahan kode Phase 38 terhadap TypeScript type checker, memastikan 100% lulus seluruh unit test Vitest (188+ tests passing), dan memverifikasi kelancaran proses build produksi Vite.

## Context
Load these files for context:
- `src/services/posSettingsService.ts`
- `src/pages/admin/PengaturanKasir.tsx`
- `src/components/pos/ReceiptModal.tsx`
- `package.json`

## Tasks

<task type="auto">
  <name>TypeScript Type Check and Full Test Suite</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan `npm run typecheck` (`tsc --noEmit`) untuk memastikan tidak ada error tipe baru.
    2. Jalankan seluruh suite tes unit Vitest: `npx vitest run`.
    3. Pastikan minimal 188 tes lulus 100% tanpa ada kegagalan.
  </action>
  <verify>npm run typecheck; npx vitest run</verify>
  <done>TypeScript type check dan seluruh rangkaian tes unit Vitest lulus tanpa error.</done>
</task>

<task type="auto">
  <name>Vite Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan bundler produksi Vite: `npm run build`.
    2. Pastikan build selesai dengan sukses (exit code 0).
  </action>
  <verify>npm run build; echo "exit=$LASTEXITCODE"</verify>
  <done>Bundler Vite menghasilkan aset produksi bersih dengan exit code 0.</done>
</task>

## Success Criteria
- [x] `tsc --noEmit` exit code 0.
- [x] Seluruh unit test Vitest lulus (0 failed).
- [ ] `npm run build` sukses dengan exit code 0.

