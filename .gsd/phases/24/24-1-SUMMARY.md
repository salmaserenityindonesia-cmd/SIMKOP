# Phase 24 Plan 1: Database Migration & Cashier Shift Service Layer Summary

## Objective
Mempersiapkan fondasi skema basis data PostgreSQL dan service layer untuk fitur shift operasional kasir (Buka & Tutup Kasir dengan Rekonsiliasi Kas Kecil POS).

## Key Deliverables Completed

### 1. Database Migration (`supabase/migrations/020_create_cashier_shifts.sql`)
- Membuat tabel `public.cashier_shifts` dengan field:
  - `id` (UUID PRIMARY KEY, default `gen_random_uuid()`)
  - `cashier_id` (UUID NOT NULL REFERENCES `public.pengelola(id)` ON DELETE CASCADE)
  - `shift_number` (TEXT NOT NULL UNIQUE)
  - `opened_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
  - `closed_at` (TIMESTAMPTZ)
  - `initial_cash` (NUMERIC NOT NULL DEFAULT 0, CHECK >= 0)
  - `cash_sales` (NUMERIC DEFAULT 0, CHECK >= 0)
  - `expected_cash` (NUMERIC DEFAULT 0)
  - `actual_cash` (NUMERIC DEFAULT 0)
  - `difference` (NUMERIC DEFAULT 0)
  - `status` (TEXT NOT NULL DEFAULT 'open', CHECK IN ('open', 'closed'))
  - `notes` (TEXT)
  - `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- Menambahkan relasi `shift_id` pada tabel `public.sales`:
  - `ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.cashier_shifts(id) ON DELETE SET NULL;`
- Membuat indeks performa:
  - `idx_cashier_shifts_cashier_status`
  - `idx_cashier_shifts_opened_at`
  - `idx_sales_shift_id`
- Mengonfigurasi Row Level Security (RLS) dan kebijakan akses idempotent (SELECT public/authenticated, ALL authenticated).

### 2. Service Layer (`src/services/cashierShiftService.ts`)
- Interface TypeScript: `CashierShift`, `OpenShiftPayload`, `CloseShiftPayload`, `ShiftReconciliationSummary`.
- Siklus hidup shift operasional:
  - `getActiveShift(cashierId?)`: Mendeteksi shift terbuka dengan fallback local storage.
  - `openShift(payload)`: Validasi shift gantung, membuat nomor shift format `SHF-YYYYMMDD-HHMMSS`, mencatat mutasi pengeluaran kas kecil `MODAL_KASIR_AWAL` di `cash_flow`.
  - `getShiftSalesSummary(shiftId, cashierId?, openedAt?)`: Agregasi penjualan tunai, deposit, tempo (kredit), dan expected cash.
  - `closeShift(payload)`: Rekonsiliasi kas fisik, kalkulasi selisih (`difference = actual_cash - expected_cash`), mencatat mutasi `PENGEMBALIAN_MODAL_KASIR`, `PENJUALAN_KASIR_TUNAI`, serta `SELISIH_LEBIH_KASIR` / `SELISIH_KURANG_KASIR`.
  - `getShiftHistory(startDate?, endDate?)`: Mengambil riwayat sesi shift tertutup dengan filter rentang tanggal.
- Dual-Layer Fallback:
  - Dukungan in-memory cache dan `localStorage` (`simkop_active_shift`, `simkop_shift_history`) yang menjamin POS tetap beroperasi lancar dan tidak crash jika PostgREST schema cache belum diperbarui.

### 3. Verification & Empirical Proof
- TypeScript type-checking: `npx tsc --noEmit` lolos tanpa error (exit code 0).
- Unit Tests: `npx vitest run src/services/cashierShiftService.test.ts` (8 tests passing in 11ms).
- Full Test Suite: `npx vitest run` (38 tests passing across 7 test files).

## Commits
- `c3b21cb8`: `feat(phase-24): create cashier shifts migration and sales relation`
- `54569634`: `feat(phase-24): build cashier shift service with cash flow mutations and dual fallback`
