# Summary: Plan 96.1 - Create Dedicated Store Credit Installment Tables (Isolated from `loans`)

## Objective
Membuat skema tabel PostgreSQL khusus untuk rencana tenor konsolidasi bon toko (`public.store_credit_installment_plans`) dan jadwal angsuran potong gaji (`public.store_credit_schedules`) di Supabase yang sepenuhnya terisolasi dari modul pinjaman (`public.loans` dan `public.loan_schedules`).

## Tasks Completed
1. **Create 052_create_store_credit_installments.sql Migration**
   - Commit: `0d676998` (`feat(phase-96): create 052_create_store_credit_installments migration`)
   - File dibuat:
     - `supabase/migrations/052_create_store_credit_installments.sql`:
       - Definisi tabel `public.store_credit_installment_plans` (kolom: `id`, `member_id`, `latest_sale_id`, `previous_unpaid_balance`, `new_credit_amount`, `total_consolidated_debt`, `tenor_months` dengan `CHECK (tenor_months >= 1)`, `monthly_installment`, `status` dengan `CHECK (status IN ('active', 'superseded', 'paid_off'))`, `created_by`, `created_at`, `updated_at`).
       - Definisi tabel `public.store_credit_schedules` (kolom: `id`, `plan_id`, `member_id`, `period_number`, `due_year`, `due_month`, `due_date`, `target_amount`, `paid_amount`, `status` dengan `CHECK (status IN ('unpaid', 'partial', 'paid'))`, `paid_at`, `receipt_number`, `notes`, `created_at`).
       - Indeks performa: `idx_sc_plans_member_status`, `idx_sc_plans_latest_sale`, `idx_sc_plans_created_at`, `idx_sc_schedules_plan_id`, `idx_sc_schedules_member_status`, `idx_sc_schedules_due_period`, `idx_sc_schedules_due_date`.
       - RLS idempoten diaktifkan untuk kedua tabel dengan policy `authenticated` dan `anon`.
       - Perintah `NOTIFY pgrst, 'reload schema';` untuk memuat ulang PostgREST schema cache secara instan.
       - Skema sepenuhnya terisolasi tanpa foreign key atau referensi ke modul `public.loans`.

## Verification
- Pemeriksaan tabel, constraint CHECK, dan NOTIFY:
  `Select-String -Path supabase/migrations/052_create_store_credit_installments.sql -Pattern "store_credit_installment_plans|store_credit_schedules|CHECK|NOTIFY pgrst"`
  Hasil: Semua tabel, constraint tenor (`tenor_months >= 1`), status, dan notifikasi schema reload terverifikasi.
- Pemeriksaan isolasi dari modul pinjaman kas:
  `Select-String -Path supabase/migrations/052_create_store_credit_installments.sql -Pattern "loans"`
  Hasil: 0 baris (tidak ada referensi ke `loans`).

## Deviations
Tidak ada deviasi dari rencana. Penomoran `052` berurutan dengan rapi setelah `051`.
