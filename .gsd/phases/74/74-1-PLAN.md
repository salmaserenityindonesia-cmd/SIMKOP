---
phase: 74
plan: 1
wave: 1
gap_closure: false
---

# Plan 74.1: Cross-Year Rolling Window & Prior Balance Summary Engine

## Objective
Membangun engine generator jendela 12 bulan bergulir lintas tahun (`getRolling12MonthRange` / pembaruan `getRolling12Months`) di `src/services/complianceService.ts` yang berujung pada bulan pembayaran terakhir anggota (misal Nov-25 s/d Okt-26 untuk anggota yang pembayaran terakhirnya Oktober 2026). Engine ini menghitung batas awal jendela (`cutoffIndex`), mengakumulasikan seluruh transaksi anggota sebelum batas jendela ke dalam struktur `priorSummary` (`wajib`, `belanja`, `lebaran`, `total`), dan menyalurkan saldo bawaan tersebut sebagai modal awal akumulasi berantai bulan demi bulan pada 12 kolom periode yang ditampilkan sehingga saldo akhir tetap seimbang sempurna dengan saldo kas riil anggota.

## Context
Load these files for context:
- `src/services/complianceService.ts`
- `src/services/complianceService.test.ts`
- `src/services/savingsRateService.ts`

## Tasks

<task type="auto">
  <name>Build Cross-Year Rolling Window Generator and Prior Balance Aggregator</name>
  <files>
    src/services/complianceService.ts
    src/services/complianceService.test.ts
  </files>
  <action>
    1. Buka `src/services/complianceService.ts`:
       - Definisikan tipe data ringkasan saldo awal pra-jendela:
         ```typescript
         export interface PriorBalanceSummary {
           wajib: number;
           belanja: number;
           lebaran: number;
           total: number;
         }
         ```
       - Tambahkan `priorSummary?: PriorBalanceSummary` pada interface `ComplianceMatrixRow`.
       - Implementasikan generator `getRolling12MonthRange(endYear: number, endMonth: number): MonthPeriod[]`:
         ```typescript
         export function getRolling12MonthRange(endYear: number, endMonth: number): MonthPeriod[] {
           const months: MonthPeriod[] = [];
           const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

           for (let i = 11; i >= 0; i--) {
             let m = endMonth - i;
             let y = endYear;
             while (m <= 0) {
               m += 12;
               y -= 1;
             }
             months.push({
               year: y,
               month: m,
               label: `${MONTH_LABELS[m - 1]}-${String(y).slice(-2)}`,
               periodIndex: y * 12 + m
             });
           }
           return months;
         }
         ```
         (Pastikan juga `getRolling12Months` dapat mendelegasikan atau kompatibel dengan `getRolling12MonthRange`).
       - Pada fungsi `getComplianceMatrixData`:
         - Tentukan acuan bulan akhir periode (`endYear`, `endMonth`). Jika tidak dispesifikasikan secara eksplisit lewat parameter, cari bulan transaksi setoran terakhir yang tercatat pada data, atau gunakan bulan acuan yang diminta.
         - Hitung `cutoffIndex = periods[0].periodIndex` (batas sebelum kolom pertama jendela 12 bulan).
         - Untuk setiap transaksi anggota sebelum `cutoffIndex` (`txPeriodIndex < cutoffIndex`), hitung mutasi setoran dikurangi penarikan untuk masing-masing jenis simpanan (Wajib, Belanja, Lebaran) ke dalam objek `priorSummary`.
         - Simpan `priorSummary` pada masing-masing `ComplianceMatrixRow`.
         - Gunakan `priorSummary` sebagai saldo awal (`runningCumW`, `runningCumB`, `runningCumL`) untuk menghitung akumulasi berantai bulan demi bulan pada 12 kolom yang ditampilkan, sehingga total kumulatif pada kolom ke-11 tepat seimbang dengan saldo kas riil (`netSavings.total`).
    2. Perbarui pengujian di `src/services/complianceService.test.ts`:
       - Tambahkan uji kasus untuk `getRolling12MonthRange(2026, 10)` yang membuktikan 12 elemen dihasilkan mulai dari `Nov-25` hingga `Okt-26`.
       - Tambahkan uji kasus perhitungan `priorSummary` untuk transaksi sebelum Nov-25 dan pastikan saldo kas riil seimbang dengan Saldo Awal + mutasi 12 bulan.
  </action>
  <verify>
    npx vitest run src/services/complianceService.test.ts
  </verify>
  <done>
    Generator 12 bulan bergulir lintas tahun dan kalkulasi `priorSummary` sebelum batas jendela berfungsi akurat dan lulus pengujian unit.
  </done>
</task>

## Success Criteria
- [ ] `getRolling12MonthRange(2026, 10)` menghasilkan tepat 12 bulan dari Nov-25 s/d Okt-26.
- [ ] `priorSummary` menghitung akumulasi seluruh simpanan anggota sebelum periode Nov-25.
- [ ] Pengujian di `src/services/complianceService.test.ts` lulus 100%.
