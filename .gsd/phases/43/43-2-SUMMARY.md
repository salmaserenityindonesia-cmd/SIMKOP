# Summary Plan 43.2: Penyelarasan Pembacaan Snapshot Simpanan pada Modal Rincian Migrasi

## Objective
Memperbarui pembacaan mutasi saldo pada modal rincian snapshot migrasi (`src/components/members/MemberMigrationDetailModal.tsx`) agar membaca nilai transaksi migrasi terkini secara bersih dan tahan terhadap rekod lama, mencocokkan deskripsi variasi pola migrasi (`migra`, `migration`, `saldo awal`, `historical`, `one-time`), memprioritaskan mutasi migrasi terbaru (berdasarkan urutan `created_at` / `id` terbaru) alih-alih menjumlahkannya, dan menampilkan angka mutlak murni dari Excel tanpa akumulasi ganda (sehingga Simpanan Pokok Joko Ramadhan tetap terbaca Rp 10.000, bukan Rp 120.000).

## Tasks Completed
- [x] **Align MemberMigrationDetailModal with Overwritten Single Migration Balances**
  - Mengabstraksi dan mengekspor fungsi murni modular `extractMigrationDeposits` dan tipe `SimpananSnapshot` di `src/components/members/MemberMigrationDetailModal.tsx`.
  - Melakukan penyaringan mutasi berbasis deskripsi komprehensif (`migra`, `migration`, `saldo awal`, `historical`, `one-time`).
  - Mengurutkan mutasi migrasi secara kronologis terbalik (`created_at` / `id` descending) dan mengambil record mutasi migrasi tunggal terkini (`amount = Math.abs(Number(migrationTxs[0].amount || 0))`) guna mencegah akumulasi ganda dari re-import lama di database.
  - Memetakan nilai per jenis simpanan (`pokok`, `wajib`, `belanja`, `lebaran`) dan menghitung total akumulasi simpanan snapshot dari penjumlahan nilai-nilai mutlak tersebut: `total = pokok + wajib + belanja + lebaran`.
  - Menambahkan test suite komprehensif pada `src/components/members/MemberMigrationDetailModal.test.tsx` (4 test baru mencakup kasus bersih Joko Ramadhan Rp 10.000, kasus multi-import 12 transaksi riwayat lama, variasi deskripsi, dan deposit kosong).

## Verification Proof
- `npm run test`: 25 test files passed, 250 tests passed (100% pass rate).
- `npm run typecheck` (`tsc --noEmit`): Exited with code 0 (zero TypeScript errors).
- `npm run build`: Production build succeeded in 1.78s without errors.
- `git log -1 --oneline`: `ecf35d09 feat(phase-43): align MemberMigrationDetailModal with overwritten single migration balances`.

## Next Steps
- Lanjutkan ke Plan 43.3: Pengujian Regresi & Validasi End-to-End Penimpaan Saldo Migrasi Joko Ramadhan.
