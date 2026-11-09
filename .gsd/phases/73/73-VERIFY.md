---
phase: 73
verified: 2026-11-10T00:07:00+07:00
status: passed
score: 6/6 must-haves verified
is_re_verification: false
---

# Phase 73 Verification Report: Implementasi Windowing 12 Bulan Bergulir dengan Saldo Bawaan Akumulatif pada Matriks Tracking Simpanan

## Executive Summary
Phase 73 telah berhasil diimplementasikan dan diverifikasi secara empiris terhadap codebase. Fitur ini mengimplementasikan jendela 12 bulan bergulir (rolling window) pada Matriks Kepatuhan Simpanan (`/admin/compliance-matrix`), merangkum transaksi masa lampau pra-12 bulan sebagai Saldo Bawaan (Opening Balance) yang digulung ke kolom bulan pertama yang tampil, dan mengakumulasikan saldo secara berantai bulan demi bulan hingga bulan berjalan sehingga saldo akhir tepat seimbang dengan saldo kas riil per anggota.

---

## Must-Haves & Empirical Evidence

### 1. MonthPeriod Interface & getRolling12Months Period Generator
- **Kriteria**: Generator periode `getRolling12Months(refYear, refMonth)` menghasilkan array tepat 12 elemen `MonthPeriod` (`year`, `month`, `label`, `periodIndex`) secara kronologis menaik dengan penanganan pergantian tahun kalender yang akurat.
- **Implementasi**: Didefinisikan dan diekspor pada `src/services/complianceService.ts` (lines 365–391).
- **Bukti Empiris**:
  - `src/services/complianceService.test.ts` (suite `getRolling12Months`):
    - Kasus lintas tahun: referensi Nov 2026 menghasilkan 12 bulan mulai dari `Des-25` hingga `Nov-26`.
    - Kasus bulan Januari: referensi Jan 2026 menghasilkan 12 bulan mulai dari `Feb-25` hingga `Jan-26`.
    - Format label seragam (`Bln-YY`) dan `periodIndex` terurut monotonik menaik.

### 2. Opening Balance Pre-12-Month Ledger & Chained Cumulative Balance Engine
- **Kriteria**: Fungsi `getComplianceMatrixData` mengagregasi seluruh setoran dan penarikan anggota sebelum `windowStartIndex` ke dalam `openingBalance` (`w`, `b`, `l`), menggulungnya ke kolom 0 (`isOpeningBalanceMonth = true`), dan mengalirkan akumulasi berantai bulan demi bulan ke `bal_w`, `bal_b`, `bal_l` serta `cum_w`, `cum_b`, `cum_l` hingga bulan berjalan di kolom 11 seimbang dengan total saldo kas riil anggota (`netSavings.total`).
- **Implementasi**: `src/services/complianceService.ts` (lines 465–560, lines 920–1130).
- **Bukti Empiris**:
  - `src/services/complianceService.test.ts`:
    - Uji kasus transaksi pra-jendela: mutasi sebelum `windowStartIndex` diagregasi akurat ke `openingBalance` dan digulung ke kolom pertama.
    - Uji kasus akumulasi berantai: `bal_w`, `bal_b`, `bal_l` serta total kumulatif pada kolom ke-11 seimbang persis dengan saldo kas riil anggota (`netSavings.total`).

### 3. Dynamic Rolling 12-Month Table Headers in UI
- **Kriteria**: Header tabel matriks di `src/pages/admin/ComplianceMatrix.tsx` menampilkan 12 kolom periode bergulir dinamis berformat `Bln-YY` (misal Des-25 s/d Nov-26) menggantikan header statis Jan–Des, dan menyorot kolom bulan berjalan secara akurat pada kolom ke-11 (`idx === rollingMonths.length - 1`).
- **Implementasi**: `src/pages/admin/ComplianceMatrix.tsx` (lines 315–320, lines 416–420, lines 925–940).
- **Bukti Empiris**:
  - `src/pages/admin/ComplianceMatrix.test.tsx`:
    - Uji render header tabel memvalidasi kemunculan label bulan bergulir dan class highlight emerald pada kolom bulan berjalan.

### 4. Opening Balance Indicator & Cumulative Hover Tooltip
- **Kriteria**: Sel kolom pertama (`monthIndex === 0`) menampilkan badge visual `+ Saldo Awal Rp [nominal]` saat anggota memiliki `row.openingBalance > 0`. Hover tooltip sel simpanan menyajikan rincian `Iuran Bulan Ini`, `Akumulasi s/d Bulan Ini`, dan `Pencapaian Saldo` (persentase terhadap total saldo kas riil anggota dengan penanganan pembagian dengan nol).
- **Implementasi**: `src/pages/admin/ComplianceMatrix.tsx` (lines 446–463, lines 517–525, lines 668–685).
- **Bukti Empiris**:
  - `src/pages/admin/ComplianceMatrix.test.tsx`:
    - Memverifikasi keberadaan elemen `data-testid="opening-balance-indicator"` pada kolom bulan 0.
    - Memverifikasi elemen `data-testid="tooltip-cumulative-summary"` menyajikan nominal iuran bulan berjalan, akumulasi kumulatif, dan persentase pencapaian saldo tanpa `NaN%`.

### 5. Automated Test Suite Validation
- **Kriteria**: Seluruh pengujian unit pada service layer dan komponen UI lulus 100% tanpa regresi pada workspace.
- **Bukti Empiris**:
  - `npx vitest run src/services/complianceService.test.ts src/pages/admin/ComplianceMatrix.test.tsx`:
    - 2 files passed, 90 tests passed (38 in complianceService.test.ts, 52 in ComplianceMatrix.test.tsx).
  - `npx vitest run`:
    - 59 test files passed, 821 tests passed in 3.11s.

### 6. Static Verification & Production Build
- **Kriteria**: TypeScript static type check dan build produksi Vite sukses tanpa error (exit code 0).
- **Bukti Empiris**:
  - `npx tsc --noEmit`: Exit code 0 (zero errors).
  - `npm run build`: Exit code 0, 2.272 modul ter-transformasi, bundle produksi ter-generate di `dist/` dalam 1.22s.

---

## Artifacts Verification

| Path | Exists | Substantive | Wired | Status |
|------|:------:|:-----------:|:-----:|:------:|
| `src/services/complianceService.ts` | ✓ | ✓ | ✓ | VERIFIED |
| `src/pages/admin/ComplianceMatrix.tsx` | ✓ | ✓ | ✓ | VERIFIED |
| `src/services/complianceService.test.ts` | ✓ | ✓ | ✓ | VERIFIED |
| `src/pages/admin/ComplianceMatrix.test.tsx` | ✓ | ✓ | ✓ | VERIFIED |

---

## Anti-Pattern Scan
- Comment stubs (`TODO`, `FIXME`, `XXX`, `HACK`): **0 found** (only standard form placeholder in search input).
- Empty implementations: **0 found**.
- Unwired exports: **0 found**.

---

## Verdict
Phase 73 **PASSED** completely. Semua kriteria dan deliverable telah divalidasi dengan bukti empiris.
