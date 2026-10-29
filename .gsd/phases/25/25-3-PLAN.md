---
phase: 25
plan: 3
wave: 3
gap_closure: false
---

# Plan 25.3: Wave 3 - Service Validation & Regression Tests

## Objective
Mengunci aturan bisnis pada lapisan service backend (`posCheckoutService.ts`) dan memverifikasi integritas sistem melalui unit testing dan Vite build:
1. Menambahkan validasi service-level pada `processCheckout`: jika transaksi tidak memiliki `memberId` (Non-Anggota) tetapi memiliki `paidDeposit > 0` atau `paidCredit > 0`, tolak transaksi dengan pesan error: "Non-anggota hanya diperbolehkan menggunakan metode pembayaran tunai."
2. Menulis unit tests komprehensif di `src/services/posCheckoutService.test.ts` untuk memverifikasi proteksi transaksi tunai non-anggota.
3. Menjalankan test runner vitest dan build Vite produksi untuk memastikan zero-regression dan type-safety 100%.

## Context
Load these files for context:
- src/services/posCheckoutService.ts
- src/services/posCheckoutService.test.ts

## Tasks

<task type="auto">
  <name>Enforce Non-Member Cash-Only Rule in Checkout Service</name>
  <files>
    src/services/posCheckoutService.ts
  </files>
  <action>
    1. Di `src/services/posCheckoutService.ts`:
       - Tambahkan pengecekan validasi non-anggota:
         ```ts
         if (!payload.memberId && (payload.paidDeposit > 0 || payload.paidCredit > 0)) {
           return {
             success: false,
             error: 'Non-anggota hanya diperbolehkan menggunakan metode pembayaran tunai.'
           };
         }
         ```
       - Pastikan validasi ini dieksekusi sebelum mutasi database (sales insert, stock deduction, cash flow).
  </action>
  <verify>
    Pemanggilan `processCheckout` dengan `memberId: null` dan `paidDeposit > 0` atau `paidCredit > 0` mengembalikan `{ success: false, error: ... }`.
  </verify>
  <done>
    Service checkout memblokir transaksi non-tunai bagi non-anggota secara permanen.
  </done>
</task>

<task type="auto">
  <name>Add Unit Tests and Run Build Verification</name>
  <files>
    src/services/posCheckoutService.test.ts
  </files>
  <action>
    1. Di `src/services/posCheckoutService.test.ts`:
       - Tambahkan unit test: "should reject checkout if non-member attempts to pay with deposit".
       - Tambahkan unit test: "should reject checkout if non-member attempts to pay with credit/bon".
       - Pastikan tes eksisting tetap pass (100% passing).
    2. Jalankan test runner:
       `npx vitest run src/services/posCheckoutService.test.ts`
    3. Jalankan build produksi Vite:
       `npm run build`
  </action>
  <verify>
    Vitest untuk posCheckoutService lulus 100% dan build produksi selesai dengan exit code 0 tanpa error tipe TypeScript.
  </verify>
  <done>
    Seluruh sistem tervalidasi dan siap untuk deployment.
  </done>
</task>

## Success Criteria
- [ ] `posCheckoutService.ts` menolak pembayaran deposit atau kredit jika `memberId` tidak ada.
- [ ] Unit tests di `posCheckoutService.test.ts` memverifikasi penolakan pembayaran non-tunai non-anggota.
- [ ] Unit test pass tanpa kegagalan.
- [ ] `npm run build` berhasil tanpa error TypeScript.

