---
phase: 28
plan: 2
wave: 2
gap_closure: false
---

# Plan 28.2: Wave 2 - Build, Unit Testing & Static Validation

## Objective
Menulis unit test untuk memvalidasi rendering identitas anggota dan non-anggota pada `SplitPaymentModal`, serta memvalidasi TypeScript types dan build produksi Vite (`npm run build`).

## Context
Load these files for context:
- src/components/pos/SplitPaymentModal.tsx
- src/components/pos/SummaryPanel.test.tsx
- package.json

## Tasks

<task type="auto">
  <name>Create Unit Tests for SplitPaymentModal & Verify Build</name>
  <files>
    src/components/pos/SplitPaymentModal.test.tsx
    src/components/pos/SplitPaymentModal.tsx
    src/pages/pos/index.tsx
  </files>
  <action>
    1. Buat berkas pengujian baru `src/components/pos/SplitPaymentModal.test.tsx`:
       - Gunakan `renderToStaticMarkup` dari `react-dom/server` dan Vitest (`describe`, `it`, `expect`).
       - Uji skenario 1: Ketika `selectedMember` diberikan (contoh: `{ id: 'm1', nrp: '95118296', nama: 'Ahmad Hidayat' }`), pastikan markup memuat:
         * "Ahmad Hidayat"
         * "95118296"
         * "Anggota Koperasi"
       - Uji skenario 2: Ketika `selectedMember` bernilai `null` (pembeli umum / non-anggota):
         * Pastikan markup memuat "Transaksi Non-Anggota (Pelanggan Umum)" dan "Umum".
         * Pastikan markup memuat pembatasan "Khusus Tunai".
       - Uji skenario 3: Ketika modal tidak terbuka (`isOpen: false`):
         * Pastikan output kosong `""`.
    2. Jalankan unit test: `npm run test` (atau `npx vitest run src/components/pos/SplitPaymentModal.test.tsx`).
    3. Jalankan typecheck TypeScript: `npm run typecheck` (`tsc --noEmit`).
    4. Jalankan build produksi: `npm run build` untuk memverifikasi exit code 0 tanpa error.
  </action>
  <verify>
    Vitest selesai dengan status 100% pass (semua unit tests baru dan lama lulus), dan `npm run build` selesai dengan exit code 0.
  </verify>
  <done>
    Fitur tervalidasi dengan tes otomatis dan siap dirilis ke produksi.
  </done>
</task>

## Success Criteria
- [ ] Unit test `SplitPaymentModal.test.tsx` tersedia dan menguji render anggota dan non-anggota.
- [ ] Semua unit test Vitest lulus (pass).
- [ ] `npm run build` dan `npm run typecheck` sukses tanpa error tipe atau bundling.

