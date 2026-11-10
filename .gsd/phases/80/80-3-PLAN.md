# Plan 80.3: Unit Testing Alignment, Static Analysis & Build Verification

## Objective
Memastikan seluruh pengujian otomatis, analisis statis TypeScript, dan build produksi Vite berjalan 100% lulus:
1. Menambahkan unit test komprehensif untuk `catatRestockFaktur` di `src/services/koperasiService.test.ts` (atau test suite pembelian):
   - Pengujian sukses eksekusi RPC `create_purchase_invoice_atomic`.
   - Pengujian penanganan error validasi bisnis (misal: nomor faktur kosong, produk tidak ditemukan).
   - Pengujian fallback jika RPC belum tersedia di database.
2. Memverifikasi seluruh modul terkait pembelian (`src/services/purchaseService.test.ts`, `src/services/purchaseReturnService.test.ts`).
3. Menjalankan typecheck `npx tsc --noEmit` dan bundler build `npm run build`.
4. Memastikan 100% tes lulus di seluruh test files Vitest.
