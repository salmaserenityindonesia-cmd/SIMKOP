# Summary Plan 43.1: Pembersihan Mutasi Simpanan Lama Tanpa Syarat & Penimpaan Saldo Tunggal Mutlak

## Objective
Memperkuat logika pembersihan transaksi simpanan di `src/services/memberExcelService.ts` pada `executeMigration`: saat migrasi anggota dijalankan, seluruh mutasi deposit lama anggota pada `deposit_transactions` dihapus menggunakan pola `.or()` komprehensif case-insensitive (`.or('description.ilike.%migrasi%,description.ilike.%saldo awal%,description.ilike.%migration%,description.ilike.%historical%')`) dengan graceful fallback ke whitelist penanda riwayat migrasi terdahulu sehingga tidak ada mutasi lama yang tertinggal atau berakumulasi ganda, lalu memasukkan tepat satu baris mutasi baru per tipe simpanan dengan nominal murni dari Excel tanpa penambahan apapun.

## Tasks Completed
- [x] **Strengthen Overwrite Cleansing for Deposit Transactions**
  - Mengupdate fungsi `executeMigration` di `src/services/memberExcelService.ts`.
  - Mengimplementasikan query delete komprehensif pada `deposit_transactions` berbasis `member_deposit_id` dan filter pola OR `ilike` untuk kata kunci migrasi, saldo awal, migration, dan historical.
  - Memastikan pencatatan tepat 1 mutasi per jenis simpanan (pokok, wajib, belanja, lebaran) jika `dt.amount > 0` dengan amount murni dari Excel tanpa manipulasi perkalian/pembagian tenor. Jika `dt.amount <= 0`, tidak ada mutasi yang diinsert (saldo bersih 0).
  - Berhasil lulus uji coba unit test suite (25 test files, 246 passed 100%) dan TypeScript static check (`tsc --noEmit`).

## Verification Proof
- `npx vitest run`: 25 test files passed, 246 tests passed (100%).
- `npx tsc --noEmit`: Exited with code 0.
- `git log -1 --oneline`: `c3d06509 feat(phase-43): strengthen overwrite cleansing for deposit transactions`.

## Next Steps
- Lanjutkan ke Plan 43.2: Penyelarasan Pembacaan Snapshot Simpanan pada Modal Rincian Migrasi (`src/components/members/MemberMigrationDetailModal.tsx`).
