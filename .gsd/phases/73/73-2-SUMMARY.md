# Phase 73 Plan 2: Dynamic Rolling Headers & Cumulative Tooltips in ComplianceMatrix Summary

## Executive Summary
Implementasi UI tabel Matriks Kepatuhan Simpanan di `src/pages/admin/ComplianceMatrix.tsx` telah berhasil diperbarui untuk menyajikan representasi 12 bulan bergulir secara dinamis, indikator Saldo Bawaan (Opening Balance) pada kolom bulan pertama untuk mutasi pra-jendela, dan tooltip interaktif yang menampilkan iuran bulanan serta kalkulasi akumulasi berantai beserta persentase pencapaian saldo kas riil.

## Key Changes
1. **Dynamic Rolling 12-Month Table Headers**:
   - Menghitung `currentPeriod` dan `rollingMonths` dari data backend (`data[0].periods`) dengan fallback ke utilitas `getRolling12Months(currentPeriod.year, currentPeriod.month)`.
   - Menggantikan header statis `MONTHS` dengan pemetaan dinamis 12 periode bergulir berformat `Bln-YY` (misal Des-25, Jan-26, ..., Nov-26).
   - Memperbarui penanda kolom bulan berjalan agar konsisten menyorot kolom ke-11 (`idx === rollingMonths.length - 1`).
   - Menyelaraskan filter penunggak (`membersInArrears`) dengan kolom bulan berjalan bergulir.

2. **Opening Balance Indicator & Cumulative Tooltips**:
   - Menambahkan penanda visual subtil `+ Saldo Awal Rp [nominal]` pada kolom pertama (`monthIndex === 0`) ketika anggota memiliki `row.openingBalance` positif (> 0).
   - Memperbarui header tooltip hover dengan label bulan bergulir (`colPeriod.label`).
   - Menyajikan ringkasan akumulatif di dasar tooltip:
     - Iuran Bulan Ini: Total setoran Wajib + Belanja + Lebaran untuk bulan bersangkutan.
     - Akumulasi s/d Bulan Ini: Akumulasi berantai setoran bersih hingga bulan bersangkutan (`totalKumulatif`).
     - Pencapaian Saldo: Persentase perbandingan akumulasi terbayar terhadap total posisi saldo kas riil anggota.

## Verification Evidence
- Vitest suite `src/pages/admin/ComplianceMatrix.test.tsx` (50 passing tests):
  - Dynamic rolling 12-month header rendering with format `Bln-YY` and current month highlight.
  - Opening balance indicator on month 0 with correct title and amounts.
  - Cumulative summary in tooltip with exact running balance, monthly deposit, and percentage.
  - Alignment of column 11 with member real cash balance.
- Vitest suite `src/services/complianceService.test.ts` (33 passing tests) verified without regressions.

## Commits
- `a1339be3`: feat(phase-73): render dynamic rolling 12-month table headers in compliancematrix
- `e9cc5425`: feat(phase-73): update cell display with opening balance indicator and cumulative tooltip
