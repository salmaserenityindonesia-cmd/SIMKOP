# Summary 81.2: Extract Deposit Management & Commitments to depositManagementService.ts

## Accomplished
- Dibuat layanan domain mandiri `src/services/depositManagementService.ts`:
  - Mengekstrak antarmuka `Simpanan`, `DepositType`, `MemberDeposit`, `DepositTransaction`, dan `MonthlyDepositCommitment`.
  - Mengimplementasikan `getDepositTypes()`, `addDepositType()`, `updateDepositType()`, `deleteDepositType()`.
  - Mengimplementasikan pendaftaran simpanan wajib otomatis `ensureMandatoryDepositsAndEnroll()`.
  - Mengimplementasikan `getMemberDeposits()`, `getMemberDepositBills()`, `addDepositTransaction()`, dan `getMonthlyDepositCommitments()`.
  - Mengintegrasikan penyesuaian tarif bertingkat (`getActiveSavingsRateTiers`) dengan fallback aman.
- Dibuat unit test mandiri `src/services/depositManagementService.test.ts` (8 tes unit) yang menguji query, sinkronisasi tarif, CRUD jenis simpanan, kalkulasi sisa tagihan simpanan, mutasi setoran, dan komitmen bulanan.
- Seluruh 8 tes unit lulus 100%.

