---
phase: 52
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 52.1: Data Contract Alignment in complianceService.ts & Unit Tests

## Objective
Memperluas kontrak data dan fungsi service `getComplianceMatrixData` di `src/services/complianceService.ts` agar menyediakan rincian granular 3 komponen simpanan (`wajib`, `belanja`, `lebaran`) per sel bulan dengan status (`'paid' | 'unpaid' | 'not_applicable'`) dan nominal terkait, serta menambahkan pengujian unit di `src/services/complianceService.test.ts`.

## Context
- `src/services/complianceService.ts`
- `src/services/complianceService.test.ts`
- `src/types/` (jika ada)

## Tasks

<task type="auto">
  <name>Ensure Compliance Data Structure Provides Granular Status per Type</name>
  <files>
    src/services/complianceService.ts
  </files>
  <action>
    1. Buka `src/services/complianceService.ts`.
    2. Definisikan interface `SavingsSubItem` dan `MonthSavingsCell`:
       ```typescript
       export interface SavingsSubItem {
         status: 'paid' | 'unpaid' | 'not_applicable';
         amount: number;
       }

       export interface MonthSavingsCell {
         month: number;
         wajib: SavingsSubItem;
         belanja: SavingsSubItem;
         lebaran: SavingsSubItem;
       }
       ```
    3. Perbarui `ComplianceMonthData` agar mempertahankan field backward-compatible (`w`, `b`, `l`, `bal_w`, `bal_b`, `bal_l`) dan menyertakan:
       ```typescript
       export interface ComplianceMonthData {
         w: number;
         b: number;
         l: number;
         bal_w: number;
         bal_b: number;
         bal_l: number;
         wajib: SavingsSubItem;
         belanja: SavingsSubItem;
         lebaran: SavingsSubItem;
       }
       ```
    4. Pada logika perakitan data `monthsData.push(...)` di `getComplianceMatrixData`:
       - Tentukan target nominal untuk masing-masing tipe: `targetWajib`, `targetBelanja`, `targetLebaran` dari `typeList` (dengan fallback default bertingkat atau default amount).
       - Petakan transaksi riil dari `p` (`p.w`, `p.b`, `p.l`):
         * `wajib`: `{ status: p.w > 0 ? 'paid' : 'unpaid', amount: p.w > 0 ? p.w : targetWajib }`
         * `belanja`: `{ status: p.b > 0 ? 'paid' : 'unpaid', amount: p.b > 0 ? p.b : targetBelanja }`
         * `lebaran`: `{ status: p.l > 0 ? 'paid' : 'unpaid', amount: p.l > 0 ? p.l : targetLebaran }`
       - Pastikan objek `ComplianceMonthData` yang dihasilkan memuat `wajib`, `belanja`, dan `lebaran`.
  </action>
  <verify>
    Fungsi service `getComplianceMatrixData` mengembalikan data dengan struktur `wajib`, `belanja`, `lebaran` pada setiap sel bulan yang aktif.
  </verify>
  <done>
    Kontrak data service kepatuhan simpanan menyediakan status granular dan nominal untuk ketiga jenis simpanan.
  </done>
</task>

<task type="auto">
  <name>Add Unit Tests for Granular Month Cell Data Structure</name>
  <files>
    src/services/complianceService.test.ts
  </files>
  <action>
    1. Buka `src/services/complianceService.test.ts`.
    2. Tambahkan test suite baru untuk memvalidasi bahwa `getComplianceMatrixData` menyertakan sub-objek `wajib`, `belanja`, dan `lebaran` dengan status `'paid'` ketika setoran tersedia, dan status `'unpaid'` dengan amount target ketika belum ada setoran.
    3. Jalankan pengujian: `npx vitest run src/services/complianceService.test.ts`.
  </action>
  <verify>
    Seluruh test di `src/services/complianceService.test.ts` lulus 100%.
  </verify>
  <done>
    Unit test memvalidasi keakuratan struktur data granular 3 simpanan per bulan.
  </done>
</task>

## Success Criteria
- [ ] Interface `SavingsSubItem`, `MonthSavingsCell`, dan `ComplianceMonthData` terdefinisi bersih di `src/services/complianceService.ts`.
- [ ] `getComplianceMatrixData` memetakan status `paid` / `unpaid` dan nominal untuk `wajib`, `belanja`, `lebaran`.
- [ ] Seluruh unit test di `src/services/complianceService.test.ts` lulus 100%.

