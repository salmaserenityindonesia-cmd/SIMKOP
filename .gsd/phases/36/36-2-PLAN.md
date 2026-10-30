---
phase: 36
plan: 2
wave: 2
depends_on: [36-1]
gap_closure: false
---

# Plan 36.2: Static Verification, Test Suite & Production Build

## Objective
Membuktikan perubahan Phase 36 bersih secara tipe, tidak meregresi tes yang ada (termasuk konsumen lama `ProductSearchAutocomplete`), dan lolos build produksi Vite.

## Context
Load these files for context:
- .gsd/phases/36/36-1-PLAN.md
- .gsd/phases/36/36-1-SUMMARY.md
- package.json (`typecheck`, `test`, `build`)

## Tasks

<task type="auto">
  <name>Type Check & Full Test Suite</name>
  <files>src/</files>
  <action>
    1. `npm run typecheck` (`tsc --noEmit`). Perbaiki error tipe yang muncul di berkas Phase 36 saja; JANGAN menekan error dengan `any`/`@ts-ignore`.
    2. `npx vitest run` — seluruh suite (baseline Phase 35: 18 file, 177 tes). Jumlah tes harus ≥ 177 + tes baru dari 36.1, 0 gagal.
    3. Pastikan konsumen lama tetap terkompilasi tanpa perubahan: `git diff --stat -- src/pages/admin/ManajemenPembelian.tsx src/pages/admin/InputReturPembelian.tsx` harus kosong.
  </action>
  <verify>npm run typecheck; npx vitest run; git diff --stat -- src/pages/admin/ManajemenPembelian.tsx src/pages/admin/InputReturPembelian.tsx</verify>
  <done>tsc exit 0; vitest 0 failures dengan jumlah tes ≥ baseline + tes baru; diff konsumen lama kosong.</done>
</task>

<task type="auto">
  <name>Vite Production Build</name>
  <files>src/</files>
  <action>
    Jalankan `npm run build` dan catat exit code serta peringatan baru (bila ada) di SUMMARY.
  </action>
  <verify>npm run build; echo "exit=$LASTEXITCODE"</verify>
  <done>Build Vite selesai dengan exit code 0 tanpa error TypeScript.</done>
</task>

## Success Criteria
- [ ] `tsc --noEmit` exit 0
- [ ] `npx vitest run` 100% lulus
- [ ] `npm run build` exit 0
- [ ] Tidak ada perubahan pada `ManajemenPembelian.tsx` / `InputReturPembelian.tsx`
