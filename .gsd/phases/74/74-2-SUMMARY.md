# Phase 74 Plan 2: Dynamic Table Headers & Prior Balance Summary Column in ComplianceMatrix Summary

**Executed Date:** 2026-11-10
**Status:** Completed
**Commit:** `c058a744`

## Overview
Menambahkan kolom khusus Saldo Awal Pra-Jendela (`Saldo Pra [Bln-YY]`) pada antarmuka tabel Matriks Kepatuhan Simpanan di `src/pages/admin/ComplianceMatrix.tsx`, tepat sebelum kolom bulan pertama. Memastikan 12 kolom periode bergulir dirender secara dinamis berurutan, sel Saldo Awal per anggota menampilkan rincian ringkas (Wajib, Belanja, Lebaran), serta `colSpan` pada baris loading/kosong disesuaikan menjadi 15.

## Key Changes
1. **`src/pages/admin/ComplianceMatrix.tsx`**:
   - Diimpor `getRolling12MonthRange` dari `src/services/complianceService.ts` dan digunakan langsung di hook `rollingMonths`.
   - Ditambahkan header `<th>` Saldo Pra-Jendela dengan label dinamis `Saldo Pra ${rollingMonths[0].label}` dan sublabel `Akumulasi Lampau`.
   - Ditambahkan sel baris `<td>` ringkasan saldo awal pra-jendela (`data-testid="prior-summary-[nrp]"`) dengan format `W: Rp ...`, `B: Rp ...`, `L: Rp ...`.
   - Disesuaikan `colSpan` pada loading spinner row dan empty data row dari 14 menjadi 15.
2. **`src/pages/admin/ComplianceMatrix.test.tsx`**:
   - Ditambahkan unit test verifikasi header kolom saldo pra-jendela dan perenderan sel ringkasan W, B, L dengan nilai terformat.
   - Ditambahkan unit test fallback penanganan `priorSummary` kosong/undefined dengan nilai default `Rp 0`.
   - Ditambahkan verifikasi `colSpan="15"` pada baris tabel kosong.

## Verification
- `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx`: 55 tests passed (100%).
- `npx vitest run src/services/complianceService.test.ts`: 41 tests passed (100%).
- `git log -1 --oneline`: `c058a744 feat(phase-74): dynamic table headers and prior balance summary column in compliancematrix`.

## Deviations
None.
