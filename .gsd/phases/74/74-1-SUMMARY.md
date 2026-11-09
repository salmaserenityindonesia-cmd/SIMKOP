# Summary: Plan 74.1 - Cross-Year Rolling Window & Prior Balance Summary Engine

## Objective
Membangun engine generator jendela 12 bulan bergulir lintas tahun (`getRolling12MonthRange` / kompatibilitas `getRolling12Months`) dan akumulator saldo awal pra-jendela (`priorSummary`) di `src/services/complianceService.ts`.

## Execution Details
1. **PriorBalanceSummary & Interface Updates**:
   - Menambahkan tipe `PriorBalanceSummary` (`wajib`, `belanja`, `lebaran`, `total`).
   - Menyematkan `priorSummary?: PriorBalanceSummary` pada interface `ComplianceMatrixRow`.
   - Menambahkan `cutoffIndex?: number` pada `ComplianceMatrixResult`.

2. **Cross-Year Rolling Window Generator**:
   - Mengimplementasikan `getRolling12MonthRange(endYear: number, endMonth: number): MonthPeriod[]` yang menghasilkan 12 bulan bergulir berurutan dari `(endMonth - 11)` s/d `endMonth`.
   - Untuk parameter `(2026, 10)`, fungsi menghasilkan tepat 12 periode dari `Nov-25` s/d `Okt-26` dengan label dan `periodIndex` yang konsisten.
   - Memastikan `getRolling12Months` mendelegasikan secara langsung ke `getRolling12MonthRange`.

3. **Engine Deteksi Transaksi Terakhir & Akumulasi Saldo Pra-Jendela**:
   - Memindahkan pengambilan transaksi ke awal proses penentuan rentang waktu.
   - Mengotomatisasi penentuan akhir periode (`endYear`, `endMonth`) berdasarkan transaksi setoran terakhir yang tercatat ketika `refMonth` tidak dispesifikasikan dalam mode rolling.
   - Menetapkan batas jendela `cutoffIndex = periods[0].periodIndex`.
   - Mengakumulasikan seluruh mutasi setoran dan penarikan sebelum `cutoffIndex` ke dalam objek `priorSummary` per anggota.
   - Mengalirkan `priorSummary` sebagai saldo awal (`runningCumW`, `runningCumB`, `runningCumL`) untuk kalkulasi saldo berantai bulan demi bulan pada 12 kolom matriks, sehingga saldo akhir di kolom ke-11 seimbang sempurna dengan saldo kas riil netto anggota (`netSavings.total`).

4. **Unit Testing**:
   - Menambahkan 3 skenario uji baru di `src/services/complianceService.test.ts`:
     1. Verifikasi `getRolling12MonthRange(2026, 10)` menghasilkan 12 bulan dari Nov-25 hingga Okt-26.
     2. Verifikasi perhitungan `priorSummary` sebelum Nov-25 dan rekonsiliasi kas riil berimbang sempurna.
     3. Verifikasi deteksi otomatis bulan setoran terakhir (Okt-26) ketika `refMonth` tidak diberikan.
   - Seluruh 41 pengujian unit pada file test berhasil lulus 100%.

## Verification Evidence
- `npx vitest run src/services/complianceService.test.ts`: 41 passed (41 total, 100%).
- `npx tsc --noEmit`: 0 errors.

## Commits Landed
- `f91e3e8e`: `feat(phase-74): build cross-year rolling window generator and prior balance aggregator`
