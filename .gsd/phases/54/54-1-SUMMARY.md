# Summary Plan 54.1: Database View & Service Layer Net Savings Aggregation

## Objective
Membangun PostgreSQL View `view_member_net_savings` pada migrasi database Supabase untuk menghitung posisi saldo kas riil per anggota (setoran dikurangi penarikan/belanja di POS/pencairan), serta memperkaya fungsi `getComplianceMatrixData` pada `src/services/complianceService.ts` dengan properti `netSavings` (`wajib`, `belanja`, `lebaran`, `total`), dilengkapi dengan unit tests komprehensif di `src/services/complianceService.test.ts`.

## Tasks Completed
| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| Task 1 | Create PostgreSQL View for Member Net Savings Position (`supabase/migrations/033_create_member_net_savings_view.sql`) | Completed | `551c3077` |
| Task 2 | Enrich Compliance Service with Net Savings Aggregation (`src/services/complianceService.ts`, `src/services/complianceService.test.ts`) | Completed | `6adc8947` |

## Key Changes
1. **Database Migration `supabase/migrations/033_create_member_net_savings_view.sql`**:
   - Mendefinisikan view `public.view_member_net_savings` yang melakukan agregasi setoran (`deposit`) dan penarikan (`withdrawal`) per anggota dan per jenis simpanan.
   - Kolom: `member_id`, `nrp`, `nama`, `deposit_type_id`, `deposit_type_code`, `deposit_type_name`, `total_deposited`, `total_withdrawn`, `net_cash_balance`.
   - Menggunakan `COALESCE` dan perhitungan `CASE WHEN tx.transaction_type = 'deposit' THEN tx.amount WHEN tx.transaction_type = 'withdrawal' THEN -tx.amount ELSE 0 END` untuk kalkulasi `net_cash_balance`.
   - Diberikan izin akses SELECT kepada role `authenticated` dan `anon`.

2. **Compliance Service Enrichment `src/services/complianceService.ts`**:
   - Menambahkan interface `MemberNetSavings` (`wajib`, `belanja`, `lebaran`, `total`).
   - Memperluas interface `ComplianceMatrixRow` dengan properti opsional `netSavings?: MemberNetSavings`.
   - Menambahkan query ke `view_member_net_savings` untuk mengambil saldo kas riil langsung dari database.
   - Mengimplementasikan fallback resilien client-side: jika view belum tersedia atau kosong (misal di lingkungan test mock), perhitungan netto diakumulasikan langsung dari daftar riwayat transaksi anggota (`memberTxs`) dengan memperhitungkan setoran dan penarikan (misal transaksi kasir POS atau penarikan tunai).
   - Memetakan properti `netSavings` ke setiap baris anggota yang dikembalikan oleh `getComplianceMatrixData`.

3. **Unit Test Suite `src/services/complianceService.test.ts`**:
   - Menambahkan unit test integrasi `view_member_net_savings` yang memverifikasi baris anggota memiliki properti `netSavings` dengan saldo Wajib, Belanja, Lebaran, dan Total.
   - Menambahkan unit test skenario penarikan simpanan belanja (pemotongan kasir POS) dan simpanan lebaran yang membuktikan keakuratan fallback perhitungan netto.
   - Menambahkan unit test untuk anggota baru tanpa mutasi menghasilkan `netSavings` bernilai 0.
   - Seluruh 27 unit test lolos 100%.

## Verification Evidence
- Vitest suite execution:
  `npx vitest run src/services/complianceService.test.ts` -> 27 passed (100% success).
- Git commits verified:
  - `551c3077 feat(phase-54): create view_member_net_savings migration`
  - `6adc8947 feat(phase-54): enrich compliance service with net savings aggregation`

## Deferred
- TypeScript pre-existing error TS2339 in `src/components/compliance/SavingsLedgerMatrixModal.tsx(260,44)` regarding `tgl_awal_anggota` on `.select('created_at')`. Sesuai pembagian rencana kerja, perbaikan ini berada di luar cakupan Plan 54.1 dan dialokasikan untuk verifikasi menyeluruh pada Plan 54.3.
