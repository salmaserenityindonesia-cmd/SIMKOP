---
phase: 30
plan: 4
wave: 4
gap_closure: false
---

# Plan 30.4: Wave 4 - Build Verification, Unit Testing & Static Check

## Objective
Memverifikasi integrasi kode secara menyeluruh dengan menambahkan unit test khusus untuk `purchaseService.ts` (menguji validasi alasan koreksi, penyesuaian delta stok, dan pencatatan audit log), menjalankan seluruh unit test Vitest pada proyek SIMKOP, serta memvalidasi type checking TypeScript dan build produksi Vite (`npm run build`).

## Context
Load these files for context:
- src/services/purchaseService.ts
- src/pages/admin/ManajemenPembelian.tsx
- package.json

## Tasks

<task type="auto">
  <name>Build Verification and Unit Testing</name>
  <files>
    src/services/purchaseService.test.ts
    src/services/purchaseService.ts
    src/pages/admin/ManajemenPembelian.tsx
  </files>
  <action>
    1. Buat unit test `src/services/purchaseService.test.ts`:
       - Uji fungsi `updatePurchaseInvoice`:
         * Melempar error jika alasan perubahan kosong atau kurang dari 10 karakter.
         * Berhasil memanggil RPC / fallback saat payload valid.
         * Menghitung ulang total nilai faktur berdasarkan perubahan qty dan harga beli item.
         * Merekonsiliasi stok delta (penambahan maupun pengurangan stok) dengan benar.
         * Mengembalikan error jika stok produk yang ingin dikurangi melebihi sisa stok yang tersedia.
       - Uji fungsi `getPurchaseAuditLogs`:
         * Mengambil riwayat log audit untuk suatu purchase ID tertentu.
    2. Jalankan test suite Vitest untuk file baru:
       `npx vitest run src/services/purchaseService.test.ts`.
    3. Jalankan seluruh unit test suite proyek:
       `npx vitest run` untuk menjamin tidak ada efek samping / regresi pada modul lain.
    4. Jalankan type checking TypeScript:
       `npm run typecheck` (atau `npx tsc --noEmit`).
    5. Jalankan build produksi Vite:
       `npm run build`.
  </action>
  <verify>
    - Seluruh unit tests di `purchaseService.test.ts` lulus 100%.
    - Semua test suite Vitest pada proyek SIMKOP lulus tanpa kegagalan.
    - Typecheck lolos dan `npm run build` sukses menghasilkan bundel produksi dengan exit code 0.
  </verify>
  <done>
    Fitur Edit Faktur Pembelian terverifikasi stabil, aman, dan siap dirilis ke lingkungan produksi.
  </done>
</task>

## Success Criteria
- [ ] Unit test `purchaseService.test.ts` dibuat dan mencakup skenario validasi, delta stok, dan audit logs.
- [ ] Seluruh unit test Vitest proyek (71+ tests) lulus 100%.
- [ ] `npm run typecheck` dan `npm run build` selesai dengan exit code 0 tanpa error tipe.

