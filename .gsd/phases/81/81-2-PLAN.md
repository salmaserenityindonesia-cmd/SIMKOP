# Plan 81.2: Extract Deposit Management & Commitments to depositManagementService.ts

## Objective
Mengekstrak seluruh fungsionalitas konfigurasi jenis simpanan, komitmen bulanan, tagihan simpanan anggota, dan transaksi setoran simpanan ke dalam layanan domain terdedikasi `src/services/depositManagementService.ts`:
1. Tipe data:
   - `DepositType`
   - `MemberDeposit`
   - `DepositTransaction`
   - `MonthlyDepositCommitment`
2. Fungsi:
   - `getDepositTypes(): Promise<DepositType[]>`
   - `addDepositType(...)`, `updateDepositType(...)`, `deleteDepositType(...)`
   - `getMemberDeposits(memberId: string): Promise<MemberDeposit[]>`
   - `ensureMandatoryDepositsAndEnroll(memberId: string)`
   - `getMemberDepositBills(memberId: string, month: number, year: number)`
   - `addDepositTransaction(...)`
   - `getMonthlyDepositCommitments(month?: number, year?: number)`
3. Mengintegrasikan dengan `savingsRateService` untuk resolusi tarif berjenjang yang akurat.
4. Membuat unit test terdedikasi `src/services/depositManagementService.test.ts`.
