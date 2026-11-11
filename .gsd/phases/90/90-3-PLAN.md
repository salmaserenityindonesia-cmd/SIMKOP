---
phase: 90
plan: 3
wave: 3
gap_closure: false
---

# Plan 90.3: Static Analysis & Build Verification

## Objective
Melakukan verifikasi mutu akhir terhadap kode yang diimplementasikan: validasi tipe data statis TypeScript (`tsc --noEmit`), eksekusi unit test Vitest pada unit yang dimodifikasi, dan verifikasi bundler produksi Vite (`npm run build`).

## Context
- `supabase/migrations/040_create_reset_financial_transactions_rpc.sql`
- `src/services/cashFlowService.ts`
- `src/services/cashFlowService.test.ts`
- `src/pages/admin/laporan-keuangan/index.tsx`
- `src/pages/admin/LaporanKeuangan.tsx`

## Tasks

<task type="auto">
  <name>Build Verification and Static Analysis</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan unit test untuk service yang baru dibuat:
       `npx vitest run src/services/cashFlowService.test.ts`.
    2. Jalankan pemeriksaan tipe TypeScript pada berkas target untuk memastikan tidak ada error kompilasi:
       `npx tsc --noEmit`.
    3. Jalankan build produksi Vite:
       `npm run build`.
       Pastikan proses build selesai dengan exit code 0.
  </action>
  <verify>
    `npx vitest run src/services/cashFlowService.test.ts` berhasil 100%, dan `npm run build` selesai dengan exit code 0 tanpa kendala.
  </verify>
  <done>
    Build Vite selesai (exit code 0) dan seluruh pengujian lolos tanpa error tipe TypeScript.
  </done>
</task>

## Success Criteria
- [ ] Unit test `src/services/cashFlowService.test.ts` lulus 100%.
- [ ] Tidak ada error tipe baru di berkas yang diubah/dibuat.
- [ ] Build produksi Vite `npm run build` sukses (exit code 0).

