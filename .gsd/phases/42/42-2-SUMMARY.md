# Plan 42.2 Summary: Idempotent Exact Replacement (Timpa Penuh) pada Sinkronisasi Simpanan & Pinjaman

## Objectives Achieved
1. **Pembersihan Mutasi Simpanan Migrasi Lama (Idempotent Overwrite)**:
   - Diimplementasikan di dalam `executeMigration` pada `src/services/memberExcelService.ts`.
   - Sebelum mutasi transaksi saldo baru dimasukkan, query mengambil seluruh `id` dari `member_deposits` milik `memberId`.
   - Jika ditemukan, mutasi transaksi migrasi lama pada tabel `deposit_transactions` dihapus menggunakan filter deskripsi migrasi historis:
     - `'Migrasi Saldo Awal (As-Is)'`
     - `'Migrasi Saldo Awal'`
     - `'One-Time Principal Deposit Migration'`
     - `'Historical Balance Migration'`
   - Dengan demikian, re-import file Excel yang direvisi akan menimpa saldo secara mutlak (exact replacement overwrite) tanpa mengakumulasi atau menggandakan saldo lama.

2. **Pembersihan Pinjaman Bawaan Migrasi Lama**:
   - Sebelum membuat record pinjaman baru dari file Excel (ketika `row.jumlah_pinjaman > 0`), sistem memeriksa keberadaan pinjaman migrasi aktif sebelumnya milik anggota tersebut.
   - Filter memeriksa pinjaman aktif berformat nomor `LOAN-MIG-%` atau `notes` mencakup `'Migrasi Histori Pinjaman'`.
   - Mengikuti integritas relasi foreign key, pembersihan dilakukan bertahap:
     1. Menghapus record pada `loan_repayments` berdasarkan `loan_id`.
     2. Menghapus record pada `loan_schedules` berdasarkan `loan_id`.
     3. Menghapus record pada `loans` berdasarkan `id`.
   - Pinjaman baru kemudian dibuat murni sesuai angka revisi dari file Excel.

3. **Isolasi Error Per Anggota**:
   - Setiap iterasi baris anggota dibungkus dalam blok `try-catch` dengan log pesan kesalahan informatif (mencantumkan NRP dan Nama), sehingga jika satu baris gagal karena anomali data, proses migrasi baris anggota lainnya tetap berlanjut tanpa terhenti.

4. **Unit Test Idempotent Overwrite**:
   - Ditambahkan unit test di `src/services/memberExcelService.test.ts`: `should execute idempotent overwrite: cleaning old migration transactions and loans before inserting new records`.
   - Menguji bahwa saat re-import dijalankan, filter `delete` pada `deposit_transactions`, `loan_repayments`, `loan_schedules`, dan `loans` terpanggil secara presisi dan data baru masuk sesuai revisi.
   - Seluruh 19 pengujian pada `src/services/memberExcelService.test.ts` lolos 100%.
   - Seluruh suite pengujian aplikasi (25 files, 244 tests) lolos 100%.
   - Validasi TypeScript `npx tsc --noEmit` exit code 0.

## Files Touched
- `src/services/memberExcelService.ts`
- `src/services/memberExcelService.test.ts`
- `.gsd/phases/42/42-2-SUMMARY.md`

## Verification Evidence
- Vitest memberExcelService: `npx vitest run src/services/memberExcelService.test.ts` -> 19 passed.
- Vitest full suite: `npx vitest run` -> 25 passed, 244 passed.
- Typecheck: `npx tsc --noEmit` -> Exit code 0.
