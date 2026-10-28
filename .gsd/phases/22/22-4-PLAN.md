---
phase: 22
plan: 4
wave: 4
gap_closure: false
---

# Plan 22.4: Pengujian Unit Test posSettingsService & Validasi Integritas Build

## Objective
Memastikan reliabilitas fitur pengaturan POS, mekanisme offline fallback, serta integritas logika pemulihan stok dengan menyusun unit tests komprehensif pada `posSettingsService.test.ts` dan menjalankan verifikasi statis (`npm run build`) serta test suite (`npx vitest run`).

## Context
Load these files for context:
- src/services/settingsService.test.ts
- src/services/posSettingsService.ts
- src/services/posParkedService.ts
- src/pages/pos/index.tsx

## Tasks

<task type="auto">
  <name>Implement Unit Tests for posSettingsService and Auto-Restock Flow</name>
  <files>
    src/services/posSettingsService.test.ts
  </files>
  <action>
    Buat berkas pengujian `src/services/posSettingsService.test.ts`:
    1. Test case pembacaan default settings saat database kosong / gagal query.
    2. Test case pembacaan dari localStorage saat Supabase melempar error schema cache (PGRST205 / 42P01).
    3. Test case penyimpanan `updatePosSettings` yang sukses menyimpan ke Supabase dan memperbarui localStorage.
    4. Test case graceful fallback penyimpanan ketika PostgREST melempar galat schema cache tanpa unhandled crash.
    5. Test case pemanggilan `cleanupExpiredParkedSales()` baik melalui RPC maupun fallback client-side handler.
  </action>
  <verify>
    Jalankan: `npx vitest run src/services/posSettingsService.test.ts`. Semua skenario pengujian lulus.
  </verify>
  <done>
    Unit tests untuk service layer POS settings dan restock lulus 100%.
  </done>
</task>

<task type="auto">
  <name>End-to-End Build and Test Suite Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan seluruh suite tes unit Vitest: `npx vitest run`.
    2. Jalankan kompilasi TypeScript dan bundler Vite: `npm run build`.
    3. Pastikan tidak ada type error atau warning yang menghambat proses kompilasi.
  </action>
  <verify>
    `npx vitest run` selesai dengan seluruh pengujian lulus.
    `npm run build` selesai dengan exit code 0.
  </verify>
  <done>
    Aplikasi terkompilasi sempurna dan siap dirilis ke production.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Berkas `src/services/posSettingsService.test.ts` lulus seluruh pengujian.
- [ ] Semua unit test yang ada di repositori lulus tanpa regresi.
- [ ] Build bundler Vite sukses tanpa type error.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Zero build warnings / errors
