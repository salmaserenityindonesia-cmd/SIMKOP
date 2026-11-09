---
phase: 73
plan: 1
wave: 1
gap_closure: false
---

# Plan 73.1: Rolling 12-Month Window & Carry-Forward Ledger Engine

## Objective
Membangun generator daftar 12 bulan bergulir (`getRolling12Months`), tipe data `MonthPeriod`, serta memperbarui engine kalkulasi `getComplianceMatrixData` di `src/services/complianceService.ts`. Engine ini menghitung batas awal jendela (window start index), merangkum seluruh setoran anggota sebelum 12 bulan terakhir sebagai Saldo Bawaan (Opening Balance), dan mengalirkan akumulasi berantai dari kolom bulan pertama hingga bulan berjalan sehingga saldo akhir tepat seimbang dengan saldo kas riil / impor Excel anggota.

## Context
Load these files for context:
- `src/services/complianceService.ts`
- `src/services/savingsRateService.ts`
- `src/services/complianceService.test.ts`

## Tasks

<task type="auto">
  <name>Define MonthPeriod and getRolling12Months Generator in complianceService.ts</name>
  <files>
    src/services/complianceService.ts
  </files>
  <action>
    1. Buka `src/services/complianceService.ts`:
       - Definisikan interface `MonthPeriod`:
         ```typescript
         export interface MonthPeriod {
           year: number;
           month: number; // 1-12
           label: string; // misal 'Des-25', 'Jan-26', ..., 'Nov-26'
           periodIndex: number; // year * 12 + month
         }
         ```
       - Implementasikan dan ekspor fungsi `getRolling12Months(refYear: number, refMonth: number): MonthPeriod[]`:
         ```typescript
         export function getRolling12Months(refYear: number, refMonth: number): MonthPeriod[] {
           const periods: MonthPeriod[] = [];
           const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
           
           for (let i = 11; i >= 0; i--) {
             let m = refMonth - i;
             let y = refYear;
             while (m <= 0) {
               m += 12;
               y -= 1;
             }
             periods.push({
               year: y,
               month: m,
               label: `${MONTH_NAMES[m - 1]}-${String(y).slice(-2)}`,
               periodIndex: y * 12 + m
             });
           }
           return periods; // Mengembalikan tepat 12 bulan berurutan
         }
         ```
       - Tambahkan properti opsional pada `ComplianceMatrixRow` dan `ComplianceMatrixResult`:
         - Pada `ComplianceMatrixRow`:
           - `openingBalance?: { w: number; b: number; l: number }`
           - `periods?: MonthPeriod[]`
         - Pada `ComplianceMonthData`:
           - `cum_w?: number`
           - `cum_b?: number`
           - `cum_l?: number`
           - `isOpeningBalanceMonth?: boolean`
         - Pada `ComplianceMatrixResult`:
           - `periods?: MonthPeriod[]`
           - `windowStartIndex?: number`
  </action>
  <verify>
    Fungsi `getRolling12Months` dan antarmuka tipe TypeScript diekspor dengan benar tanpa error kompilasi.
  </verify>
  <done>
    Generator 12 bulan bergulir dan antarmuka model data tersedia di complianceService.
  </done>
</task>

<task type="auto">
  <name>Implement Rolling Window Ledger & Opening Balance Accumulator in getComplianceMatrixData</name>
  <files>
    src/services/complianceService.ts
  </files>
  <action>
    1. Buka `src/services/complianceService.ts`:
       - Perbarui tanda tangan `getComplianceMatrixData`:
         ```typescript
         export async function getComplianceMatrixData(
           yearOrRolling?: number | string,
           depositType?: string,
           refMonth?: number
         ): Promise<ComplianceMatrixResult>
         ```
       - Tentukan acuan periode bulan berjalan:
         - Jika `yearOrRolling === 'rolling'` atau `yearOrRolling === undefined` atau sama dengan tahun saat ini: gunakan jendela 12 bulan bergulir (`getRolling12Months(currentYear, currentMonth)`).
         - Jika `yearOrRolling` berupa tahun spesifik selain tahun berjalan (misal data arsip 2024): tetap dukung mode 12 bulan kalender (Jan s/d Des) agar kompatibilitas filter riwayat historis tetap terjaga.
       - Untuk mode 12 bulan bergulir:
         - Ambil `periods = getRolling12Months(targetYear, targetMonth)`.
         - Titik potong awal jendela: `windowStartIndex = periods[0].periodIndex`.
         - Hitung **Saldo Bawaan Pra-12 Bulan (Opening Balance)** per anggota:
           $$\text{openingBalance.w} = \sum \text{amount dari transaksi WAJIB dengan } (txYear \times 12 + txMonth) < windowStartIndex$$
           $$\text{openingBalance.b} = \sum \text{amount dari transaksi BELANJA dengan } (txYear \times 12 + txMonth) < windowStartIndex$$
           $$\text{openingBalance.l} = \sum \text{amount dari transaksi LEBARAN dengan } (txYear \times 12 + txMonth) < windowStartIndex$$
         - Untuk 12 kolom bulan yang ditampilkan (`periods[0..11]`):
           - Ambil setoran transaksi rutin untuk bulan `periods[i]`.
           - Kolom 0 (bulan tertua pada jendela):
             - `cum_w = openingBalance.w + nominalBulanIni_w`
             - `cum_b = openingBalance.b + nominalBulanIni_b`
             - `cum_l = openingBalance.l + nominalBulanIni_l`
             - `isOpeningBalanceMonth = true`
           - Kolom 1..11 (menuju bulan berjalan):
             - `cum_w = totalKumulatifPrev_w + nominalBulanIni_w`
             - `cum_b = totalKumulatifPrev_b + nominalBulanIni_b`
             - `cum_l = totalKumulatifPrev_l + nominalBulanIni_l`
         - Pastikan `bal_w`, `bal_b`, `bal_l` pada setiap bulan merefleksikan saldo kumulatif tersebut.
         - Masukkan `openingBalance` dan `periods` ke dalam hasil `ComplianceMatrixRow` dan `ComplianceMatrixResult`.
  </action>
  <verify>
    Jalankan unit test terkait untuk memastikan kalkulasi saldo bawaan dan akumulasi 12 bulan berjalan dengan benar.
  </verify>
  <done>
    `getComplianceMatrixData` menyajikan data 12 bulan bergulir dengan saldo bawaan terintegrasi secara presisi.
  </done>
</task>

## Success Criteria
- [ ] `getRolling12Months` menghasilkan array tepat 12 elemen `MonthPeriod` dengan label dan periodIndex yang benar
- [ ] Transaksi sebelum periode kolom pertama diagregasi sebagai Saldo Bawaan (Opening Balance)
- [ ] Akumulasi berantai terhitung dari kolom 0 hingga kolom 11 dan seimbang dengan total saldo kas riil anggota
