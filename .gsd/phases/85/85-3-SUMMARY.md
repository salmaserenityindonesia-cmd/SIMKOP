# Plan 85.3 Summary: UI Tab in /admin/penarikan-simpanan & Type-to-Confirm Modal

## Overview
Implementasi antarmuka pengguna untuk Pencairan Massal Simpanan Lebaran di halaman `/admin/penarikan-simpanan`. Halaman kini memiliki sistem tab navigasi yang memisahkan **Penarikan Perorangan (Reguler)** dan **Pencairan Massal Simpanan Lebaran** tanpa regresi fungsi. Tab pencairan massal dilengkapi banner status siklus terakhir, ringkasan kartu metrik simulasi, filter pencarian & status pinjaman, tabel nominatif penerima 100% saldo, ekspor CSV nominatif, riwayat siklus, serta modal konfirmasi kritis dengan verifikasi wajib mengetik teks **`CAIRKAN LEBARAN`**.

## Key Changes
1. **`BulkDisbursementConfirmModal.tsx`**:
   - Peringatan kritis bergradien merah/amber mengenai risiko pencairan 100% saldo seluruh anggota aktif.
   - Ringkasan metrik (Total Anggota Penerima & Total Dana Dicairkan dalam format Rupiah).
   - Form input Nama Siklus, Tanggal Cut-off, dan Catatan Tambahan.
   - Input verifikasi ketik teks: Wajib mengetik kata **`CAIRKAN LEBARAN`** secara presisi sebelum tombol "Konfirmasi & Eksekusi Sekarang" terbuka.
   - State loading dengan indikator proses batch mutasi.

2. **`BulkLebaranTab.tsx`**:
   - Banner status siklus terakhir (`getLastCompletedLebaranCycle`) dengan detail tanggal cut-off, nama siklus, total dana, dan jumlah penerima.
   - 3 Kartu Metrik Ringkasan: Total Anggota Penerima, Total Dana Lebaran Siap Cair, dan Rata-rata Tabungan per Anggota.
   - Filter & pencarian nominatif anggota (pencarian nama/nrp/rekening, serta filter Bebas Pinjaman vs Ada Pinjaman Aktif).
   - Tabel Daftar Nominatif Pencairan: No, NRP, Nama & Pangkat, Bank & No. Rekening, Saldo Dicairkan (100%), Saldo Setelah Cair (Rp 0), dan Catatan Pinjaman Aktif (badge detail sisa hutang pinjaman).
   - Tombol aksi: Refresh Simulasi, Ekspor Daftar Nominatif (CSV UTF-8 BOM), dan Eksekusi Pencairan Massal.
   - Tabel Riwayat Siklus Pencairan Massal: Tanggal Cut-off, Nama Siklus, Jumlah Anggota, Total Dana, Status Badge (COMPLETED, APPROVED, DRAFT, REJECTED), serta tombol Eksekusi/Tolak untuk status DRAFT.

3. **`index.tsx`**:
   - State `activeTab`: `'regular' | 'bulk_lebaran'`.
   - Tab switcher modern dengan indikator badge "THR".
   - Integrasi tabuler tanpa mengubah alur atau merusak fungsionalitas penarikan reguler dan kwitansi (zero regression).

4. **Testing Suite**:
   - `BulkDisbursementConfirmModal.test.tsx` (4 tests)
   - `BulkLebaranTab.test.tsx` (1 test)
   - `index.test.tsx` (1 test)

## Verification Evidence
- **Vitest Unit Tests**:
  - `src/pages/admin/penarikan-simpanan/`: 3 test files, 6 tests passing (100%).
  - `src/services/bulkWithdrawalService.test.ts`: 12 tests passing (100%).
  - Full test suite: 69 test files, 970 tests passing (100%).
- **TypeScript Typecheck**:
  - `npx tsc --noEmit` exited 0 with no diagnostic errors.
- **Vite Production Build**:
  - `npm run build` succeeded in 1.15s generating production bundles.

## Commit
- `377d6fe7` feat(phase-85): build bulk disbursement tab and type-to-confirm modal
