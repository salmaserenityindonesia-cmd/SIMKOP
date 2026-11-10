---
phase: 78
plan: 3
wave: 3
gap_closure: false
---

# Plan 78.3: Test Suite Alignment, Static Analysis & Build Verification

## Objective
Menyelaraskan suite pengujian unit pada `src/services/posCheckoutService.test.ts` dengan arsitektur RPC baru, memverifikasi tidak ada regresi pada modul kasir lain, dan memastikan `npm run build` serta `npm run test` lulus 100%.

## Context
Load these files for context:
- `src/services/posCheckoutService.test.ts`
- `src/services/posCheckoutService.ts`
- `src/pages/pos/index.tsx`

## Tasks

<task type="auto">
  <name>Align posCheckoutService.test.ts with Atomic RPC Pattern</name>
  <files>
    src/services/posCheckoutService.test.ts
  </files>
  <action>
    1. Buka `src/services/posCheckoutService.test.ts`.
    2. Perbarui pengujian unit:
       - Uji pemanggilan `supabase.rpc('process_pos_checkout', ...)` untuk skenario:
         * Checkout tunai (dengan shift aktif, kembalian, dan payload item terstruktur).
         * Checkout split pembayaran (tunai + simpanan belanja).
         * Checkout kredit anggota (bon toko).
       - Uji penanganan error RPC:
         * Penolakan stok tidak mencukupi (pesan error dari PostgreSQL RPC diteruskan ke UI).
         * Penolakan saldo simpanan belanja tidak mencukupi.
         * Penolakan koneksi / error database timeout.
       - Uji validasi sisi klien:
         * Non-anggota mencoba menggunakan non-tunai langsung ditolak sebelum memanggil RPC.
         * Limit kredit terlampaui langsung ditolak sebelum memanggil RPC.
       - Uji fallback kompatibilitas (jika RPC belum dideploy/kode PGRST202).
  </action>
  <verify>
    Jalankan `npx vitest run src/services/posCheckoutService.test.ts` dan pastikan seluruh test lolos tanpa kegagalan.
  </verify>
  <done>
    Unit test `posCheckoutService.test.ts` mencakup 100% jalur eksekusi RPC atomik.
  </done>
</task>

<task type="auto">
  <name>Run Full Test Suite and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan type checking TypeScript: `npx tsc --noEmit`.
    2. Jalankan full test suite: `npm run test -- --run`.
    3. Jalankan Vite production build: `npm run build`.
  </action>
  <verify>
    Seluruh tes (890+ tests) lulus dan build Vite menghasilkan exit code 0.
  </verify>
  <done>
    Migrasi transaksi multi-tabel POS ke RPC atomik tuntas dan diverifikasi secara menyeluruh.
  </done>
</task>

