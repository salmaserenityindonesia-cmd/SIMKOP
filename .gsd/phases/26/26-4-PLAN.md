---
phase: 26
plan: 4
wave: 4
gap_closure: false
---

# Plan 26.4: Wave 4 - Unit Tests & Build Verification

## Objective
Menjamin kualitas kode dan mencegah regresi melalui unit testing komprehensif pada service settings, receipt generator, dan pos checkout service, diikuti dengan verifikasi build bundler Vite tanpa error type checking.

## Context
Load these files for context:
- src/services/posSettingsService.test.ts
- src/utils/receiptPdfGenerator.test.ts
- src/services/posCheckoutService.test.ts

## Tasks

<task type="auto">
  <name>Expand Unit Tests for Dynamic Member Discount</name>
  <files>
    src/services/posSettingsService.test.ts,
    src/utils/receiptPdfGenerator.test.ts
  </files>
  <action>
    1. Di `src/services/posSettingsService.test.ts`:
       - Tambahkan unit test untuk `member_discount_percentage`:
         * Memastikan `DEFAULT_POS_SETTINGS.member_discount_percentage === 5.0`.
         * Memastikan `getPosSettings` mengembalikan `member_discount_percentage` default saat fallback.
         * Memastikan `getPosSettings` membaca `member_discount_percentage` dari Supabase dan menyimpan ke localStorage.
         * Memastikan `updatePosSettings` mengirimkan `member_discount_percentage` baru (misal: 10.0%) ke Supabase upsert payload.
    2. Di `src/utils/receiptPdfGenerator.test.ts`:
       - Tambahkan pengujian pembuatan struk PDF dengan custom `discountPercentage`:
         * Kasus diskon 10%: verifikasi dokumen dibuat tanpa error saat `discountPercentage: 10` dan `discount > 0`.
         * Kasus diskon 0%: verifikasi dokumen dibuat tanpa error saat `discount: 0`.
  </action>
  <verify>
    Jalankan test suite Vitest: `npx vitest run src/services/posSettingsService.test.ts src/utils/receiptPdfGenerator.test.ts` dan seluruh test berstatus pass (hijau).
  </verify>
  <done>
    Unit tests memvalidasi logika persentase diskon dinamis dengan akurat.
  </done>
</task>

<task type="auto">
  <name>Full Test Suite and Production Build Verification</name>
  <files>
    package.json
  </files>
  <action>
    1. Jalankan seluruh unit test suite:
       `npx vitest run`
    2. Jalankan build produksi Vite & Type Checking:
       `npm run build`
    3. Pastikan tidak ada kegagalan tipe TypeScript, broken imports, atau syntax errors.
  </action>
  <verify>
    Vitest lulus 100% dan `npm run build` selesai dengan exit code 0 tanpa error.
  </verify>
  <done>
    Fitur konfigurasi diskon anggota dinamis terverifikasi siap produksi dan bebas regresi.
  </done>
</task>

## Success Criteria
- [ ] Unit test `posSettingsService.test.ts` mencakup pengujian `member_discount_percentage`.
- [ ] Unit test `receiptPdfGenerator.test.ts` mencakup custom `discountPercentage`.
- [ ] Seluruh unit test Vitest lulus (100% pass).
- [ ] `npm run build` berhasil tanpa error (exit code 0).
