---
phase: 96
plan: 1
wave: 1
gap_closure: false
---

# Plan 96.1: Create Dedicated Store Credit Installment Tables (Isolated from `loans`)

## Objective
Membuat skema tabel PostgreSQL khusus untuk rencana tenor konsolidasi bon toko (`public.store_credit_installment_plans`) dan jadwal angsuran potong gaji (`public.store_credit_schedules`) di Supabase yang sepenuhnya terisolasi dari modul pinjaman (`public.loans` dan `public.loan_schedules`).

## Context
- .gsd/SPEC.md
- .gsd/phases/96/RESEARCH.md
- supabase/migrations/038_create_store_credit_payments_table.sql
- supabase/migrations/046_create_lebaran_disbursement_cycles.sql

## Tasks

<task type="auto">
  <name>Create 052_create_store_credit_installments.sql Migration</name>
  <files>
    supabase/migrations/052_create_store_credit_installments.sql
  </files>
  <action>
    1. Buat berkas migrasi `supabase/migrations/052_create_store_credit_installments.sql` (nomor urut 052 karena 043–051 sudah terpakai).
    2. Definisikan tabel `public.store_credit_installment_plans`:
       - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
       - `member_id uuid NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE`
       - `latest_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL`
       - `previous_unpaid_balance numeric NOT NULL DEFAULT 0`
       - `new_credit_amount numeric NOT NULL DEFAULT 0`
       - `total_consolidated_debt numeric NOT NULL`
       - `tenor_months integer NOT NULL CHECK (tenor_months >= 1)`
       - `monthly_installment numeric NOT NULL`
       - `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'paid_off'))`
       - `created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`
       - `created_at timestamp with time zone NOT NULL DEFAULT now()`
       - `updated_at timestamp with time zone NOT NULL DEFAULT now()`
    3. Definisikan tabel `public.store_credit_schedules`:
       - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
       - `plan_id uuid NOT NULL REFERENCES public.store_credit_installment_plans(id) ON DELETE CASCADE`
       - `member_id uuid NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE`
       - `period_number integer NOT NULL`
       - `due_year integer NOT NULL`
       - `due_month integer NOT NULL`
       - `due_date date NOT NULL`
       - `target_amount numeric NOT NULL`
       - `paid_amount numeric NOT NULL DEFAULT 0`
       - `status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid'))`
       - `paid_at timestamp with time zone`
       - `receipt_number text`
       - `notes text`
       - `created_at timestamp with time zone NOT NULL DEFAULT now()`
    4. Tambahkan indeks `idx_sc_plans_member_status`, `idx_sc_schedules_plan_id`, dan `idx_sc_schedules_member_status`.
    5. Aktifkan RLS dan tambahkan policy idempoten (`DROP POLICY IF EXISTS` sebelum `CREATE POLICY`) untuk `authenticated` (serta `anon` jika mengikuti pola lokal proyek) dan akhiri dengan `NOTIFY pgrst, 'reload schema';`.
    6. AVOID: Membuat foreign key atau trigger apa pun ke tabel `public.loans` atau `public.loan_schedules` agar piutang toko tetap terisolasi.
  </action>
  <verify>
    PowerShell check file & constraint SQL:
    `Select-String -Path supabase/migrations/052_create_store_credit_installments.sql -Pattern "store_credit_installment_plans|store_credit_schedules|CHECK|NOTIFY pgrst"`
    Pastikan tidak ada referensi ke `public.loans` (`Select-String -Path supabase/migrations/052_create_store_credit_installments.sql -Pattern "loans"` menghasilkan 0 baris).
  </verify>
  <done>
    File `supabase/migrations/052_create_store_credit_installments.sql` tersedia dengan definisi lengkap kedua tabel, indeks, RLS policy idempoten, dan `NOTIFY pgrst`, tanpa relasi ke `public.loans`.
  </done>
</task>

## Must-Haves
- [ ] Penomoran migrasi `052` tidak bentrok dengan `043`–`051` yang sudah ada.
- [ ] Constraint `tenor_months >= 1` dan status enum (`active`, `superseded`, `paid_off` / `unpaid`, `partial`, `paid`) terpasang.
- [ ] Tidak ada relasi atau pencampuran ke `public.loans`.

## Success Criteria
- [ ] Semua task lulus verifikasi sintaks & isolasi skema.
