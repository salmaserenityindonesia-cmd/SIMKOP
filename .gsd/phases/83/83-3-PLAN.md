---
phase: 83
plan: 3
wave: 3
gap_closure: false
---

# Plan 83.3: Unit Testing, Static Verification & Production Build

## Objective
Memvalidasi seluruh perubahan pada `PengaturanKoperasi.tsx` dengan pengujian unit otomatis di Vitest, pemeriksaan tipe statis TypeScript (`tsc --noEmit`), dan kompilasi build produksi Vite (`npm run build`).

## Context
Load these files for context:
- src/pages/admin/PengaturanKoperasi.tsx
- src/pages/admin/PengaturanKoperasi.test.tsx
- src/services/settingsService.ts

## Tasks

<task type="auto">
  <name>Update and Expand Unit Tests for Flexible Input and Confirmation Modal</name>
  <files>src/pages/admin/PengaturanKoperasi.test.tsx</files>
  <action>
    - Buka `src/pages/admin/PengaturanKoperasi.test.tsx`.
    - Tambahkan unit test untuk memvalidasi:
      1. Elemen input `minRemainingThp` memiliki atribut `step="any"` dan `min="0"`, serta tidak lagi memiliki `step="50000"` atau `min="1"`.
      2. Rendering modal konfirmasi saat nominal berubah:
         - Uji teks judul modal "Konfirmasi Perubahan Batas Kelayakan Pinjaman".
         - Uji badge nominal lama dan nominal baru.
         - Uji frasa verifikasi `SETUJU`.
  </action>
  <verify>
    Jalankan `npx vitest run src/pages/admin/PengaturanKoperasi.test.tsx src/services/settingsService.test.ts`.
  </verify>
  <done>Unit test memverifikasi kelenturan input dan keberadaan komponen modal konfirmasi.</done>
</task>

<task type="auto">
  <name>Run Full Build and Static Typecheck</name>
  <files>src/</files>
  <action>
    - Jalankan typechecker TypeScript: `npx tsc --noEmit`.
    - Jalankan bundler produksi: `npm run build`.
    - Jalankan regression test suite jika diperlukan.
  </action>
  <verify>
    `npx tsc --noEmit` exit code 0 dan `npm run build` exit code 0 tanpa error.
  </verify>
  <done>Build produksi Vite berhasil dan siap rilis tanpa error tipe TypeScript.</done>
</task>

## Must-Haves
- [ ] Unit tests di `src/pages/admin/PengaturanKoperasi.test.tsx` lulus 100%.
- [ ] `tsc --noEmit` exit code 0.
- [ ] `npm run build` exit code 0.

## Success Criteria
- [ ] Zero TypeScript errors.
- [ ] Zero build warnings/errors.
