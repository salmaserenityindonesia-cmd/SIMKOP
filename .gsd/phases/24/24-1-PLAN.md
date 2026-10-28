---
phase: 24
plan: 1
wave: 1
gap_closure: false
---

# Plan 24.1: Skema Database cashier_shifts & Service Layer Mutasi Kasir

## Objective
Mempersiapkan fondasi data dan service layer untuk fitur shift operasional kasir (Buka & Tutup Kasir):
1. Membuat migrasi database PostgreSQL `supabase/migrations/020_create_cashier_shifts.sql` yang mendefinisikan tabel `cashier_shifts`, relasi ke pengelola/kasir, dan penambahan kolom `shift_id` pada tabel `sales`.
2. Mengembangkan `src/services/cashierShiftService.ts` yang mengelola siklus hidup shift kasir (pembukaan modal kas kecil awal, penutupan dengan rekonsiliasi fisik, perhitungan selisih kas, mutasi arus kas ke tabel `cash_flow`, serta fallback penyimpanan `localStorage` offline).

## Context
Load these files for context:
- supabase/migrations/015_create_cash_flow_and_withdrawal_rpc.sql
- supabase/migrations/016_create_pos_sales_tables.sql
- src/services/posCheckoutService.ts
- src/lib/supabaseClient.ts

## Tasks

<task type="auto">
  <name>Create Supabase Migration for Cashier Shifts and Sales Relation</name>
  <files>
    supabase/migrations/020_create_cashier_shifts.sql
  </files>
  <action>
    Buat file migrasi `supabase/migrations/020_create_cashier_shifts.sql`:
    1. Tabel `public.cashier_shifts`:
       - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
       - `cashier_id UUID NOT NULL REFERENCES public.pengelola(id) ON DELETE CASCADE`
       - `shift_number TEXT NOT NULL UNIQUE`
       - `opened_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL`
       - `closed_at TIMESTAMP WITH TIME ZONE`
       - `initial_cash NUMERIC NOT NULL DEFAULT 0 CHECK (initial_cash >= 0)`
       - `cash_sales NUMERIC DEFAULT 0 CHECK (cash_sales >= 0)`
       - `expected_cash NUMERIC DEFAULT 0`
       - `actual_cash NUMERIC DEFAULT 0`
       - `difference NUMERIC DEFAULT 0`
       - `status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))`
       - `notes TEXT`
       - `created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL`
    2. Modifikasi tabel `public.sales`:
       - `ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.cashier_shifts(id) ON DELETE SET NULL;`
    3. Indeks performa:
       - `CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier_status ON public.cashier_shifts(cashier_id, status);`
       - `CREATE INDEX IF NOT EXISTS idx_cashier_shifts_opened_at ON public.cashier_shifts(opened_at DESC);`
       - `CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON public.sales(shift_id);`
    4. Row Level Security & Policies:
       - `ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;`
       - Policy SELECT publik / authenticated:
         `CREATE POLICY "Allow read cashier_shifts" ON public.cashier_shifts FOR SELECT USING (true);`
       - Policy INSERT / UPDATE untuk user terotentikasi:
         `CREATE POLICY "Allow manage cashier_shifts" ON public.cashier_shifts FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');`
  </action>
  <verify>
    Sintaks SQL valid, seluruh kolom dan constraint sesuai spesifikasi, dan idempotent (`IF NOT EXISTS`).
  </verify>
  <done>
    Skema database untuk shift kasir dan pencatatan kas kecil siap dieksekusi.
  </done>
</task>

<task type="auto">
  <name>Build Cashier Shift Service with Cash Flow Mutations and Dual-Layer Fallback</name>
  <files>
    src/services/cashierShiftService.ts
  </files>
  <action>
    Buat modul `src/services/cashierShiftService.ts`:
    1. Definisikan tipe data TypeScript:
       - `CashierShift`: field sesuai database (`id`, `cashier_id`, `shift_number`, `opened_at`, `closed_at`, `initial_cash`, `cash_sales`, `expected_cash`, `actual_cash`, `difference`, `status`, `notes`, `cashier_name?`).
       - `OpenShiftPayload`: `{ cashierId: string; initialCash: number; notes?: string }`.
       - `CloseShiftPayload`: `{ shiftId: string; actualCash: number; notes?: string }`.
       - `ShiftReconciliationSummary`: `{ shiftId: string; initialCash: number; cashSales: number; nonCashSales: number; totalSales: number; expectedCash: number; actualCash: number; difference: number; transactionCount: number }`.
    2. Sediakan in-memory cache dan fallback ganda `localStorage` (`simkop_active_shift`, `simkop_shift_history`) agar POS kebal dari kegagalan schema cache PostgREST saat migrasi belum dijalankan di server Supabase.
    3. Fungsi `getActiveShift(cashierId?: string): Promise<CashierShift | null>`:
       - Mengambil shift dengan `status = 'open'` untuk kasir aktif.
    4. Fungsi `openShift(payload: OpenShiftPayload): Promise<CashierShift>`:
       - Validasi bahwa kasir tidak memiliki shift 'open' lain yang menggantung.
       - Buat nomor shift unik: format `SHF-YYYYMMDD-HHMMSS` (contoh: `SHF-20261028-083000`).
       - Simpan ke `cashier_shifts`.
       - Catat mutasi pengeluaran kas kecil di `cash_flow` (`direction: 'out'`, `amount: initialCash`, `category: 'MODAL_KASIR_AWAL'`, `reference_id: shift.id`).
    5. Fungsi `getShiftSalesSummary(shiftId: string, cashierId?: string, openedAt?: string): Promise<ShiftReconciliationSummary>`:
       - Menghitung total `paid_cash`, `paid_deposit`, `paid_credit`, dan `total_amount` dari tabel `sales` yang memiliki `shift_id = shiftId` (atau rentang waktu shift aktif jika shift_id null).
    6. Fungsi `closeShift(payload: CloseShiftPayload): Promise<CashierShift>`:
       - Hitung `cash_sales` dari data transaksi actual.
       - Hitung `expected_cash = initial_cash + cash_sales`.
       - Hitung `difference = actual_cash - expected_cash`.
       - Update shift menjadi `status = 'closed'` dan isi `closed_at`, `actual_cash`, `difference`, `notes`.
       - Catat mutasi pemasukan kas di `cash_flow`:
         * `PENGEMBALIAN_MODAL_KASIR` (`direction: 'in'`, `amount: initial_cash`)
         * `PENJUALAN_KASIR_TUNAI` (`direction: 'in'`, `amount: cash_sales`)
         * `SELISIH_LEBIH_KASIR` (jika difference > 0) atau `SELISIH_KURANG_KASIR` (jika difference < 0).
    7. Fungsi `getShiftHistory(startDate?: string, endDate?: string): Promise<CashierShift[]>`:
       - Mengambil daftar shift tertutup untuk laporan audit.
  </action>
  <verify>
    Fungsi `openShift`, `getActiveShift`, `getShiftSalesSummary`, dan `closeShift` bekerja presisi serta aman dari crash jaringan / schema error.
  </verify>
  <done>
    Service layer manajemen shift kasir selesai dibangun dan teruji.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Berkas migrasi `supabase/migrations/020_create_cashier_shifts.sql` terbuat dengan struktur tabel, relasi sales, indeks, dan RLS.
- [ ] Berkas service `src/services/cashierShiftService.ts` mengekspor seluruh fungsi siklus shift dan mutasi `cash_flow`.
- [ ] Tersedia mekanisme offline/localStorage fallback yang membuat sistem tahan banting.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] TypeScript type-checking lolos tanpa error

