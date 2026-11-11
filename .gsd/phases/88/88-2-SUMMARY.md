# Summary 88.2: Support POKOK Code in Batch Import and Review Parser

## Overview
Implementasi dukungan kode `POKOK` pada alur parser, pratinjau review konfirmasi, dan eksekusi impor pemutakhiran massal simpanan di `src/services/batchUpdateService.ts` dan `src/pages/admin/BatchUpdater.tsx`.

## Accomplished Work
1. **Parser & Batch Execution Service (`src/services/batchUpdateService.ts`)**:
   - `parseBatchUpdateFile`:
     * Mengizinkan kode simpanan `POKOK` / `SP`.
     * Memeriksa keberadaan rekening simpanan pokok anggota (`member_deposits`).
     * Jika anggota belum memiliki entri `member_deposits` bertipe `POKOK`, baris tetap ditandai `status: 'READY'` dengan `member_id` disertakan pada metadata `BatchPreviewRow`, sehingga tidak memblokir import sebagai `MISMATCH`.
   - `executeBatchUpdate`:
     * Memisahkan penanganan simpanan rutin bulanan (`WAJIB`, `LEBARAN`, `BELANJA`) dengan `POKOK`.
     * Simpanan rutin: menghapus mutasi lama pada periode bulan/tahun bersangkutan lalu menyisipkan mutasi baru (idempotensi bulanan).
     * Simpanan pokok (`POKOK`): memastikan entri `member_deposits` tersedia (dibuat secara otomatis jika belum ada akun rekening simpanan pokok untuk anggota bersangkutan), kemudian menyisipkan mutasi setoran ke `deposit_transactions` dengan deskripsi `"Setoran Simpanan Pokok via Update Massal Bulanan"`.
     * Mengembalikan ringkasan eksekusi yang detail (`BatchExecutionSummary`) mencakup jumlah baris rutin dan pokok yang diproses.

2. **Review UI Enhancement (`src/pages/admin/BatchUpdater.tsx`)**:
   - Menambahkan badge visual khusus berwarna indigo `"Simpanan Pokok"` pada kolom Jenis/Kontrak di tabel Review & Konfirmasi pratinjau.
   - Memberikan styling latar belakang baris bertema indigo untuk memudahkan admin mengenali baris pelunasan simpanan pokok.
   - Menambahkan counter badge jumlah baris Simpanan Pokok pada ringkasan metrics pratinjau.
   - Menyelaraskan pesan sukses eksekusi dengan feedback ringkasan dari service.

## Verification
- Unit test suite: 73 test files, 1002 passing tests (`npm test`).
- Production build: `npm run build` sukses tanpa error tipe atau bundling.
- Git commits:
  * `9a51207a`: `feat(phase-88): handle POKOK in parser and batch execution service`
  * `50c99bd5`: `feat(phase-88): enhance review UI in BatchUpdater for POKOK rows`
