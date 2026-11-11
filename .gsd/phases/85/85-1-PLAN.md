---
phase: 85
plan: 1
wave: 1
gap_closure: false
---

# Plan 85.1: Database Migration for Batch Cycles and Atomic RPC

## Objective
Membangun skema persistensi siklus pencairan massal simpanan lebaran (`lebaran_disbursement_cycles`) dan fungsi PostgreSQL RPC atomik (`execute_bulk_lebaran_disbursement`) untuk mengeksekusi penarikan 100% saldo simpanan lebaran seluruh anggota secara serentak, aman dari race condition, serta mencatat audit trail secara otomatis.

## Context
Load these files for context:
- supabase/migrations/044_create_atomic_purchase_invoice_rpc.sql
- supabase/migrations/045_add_min_remaining_thp_to_koperasi_profile.sql
- src/services/withdrawal.service.ts

## Tasks

<task type="auto">
  <name>Create Cycles Table and execute_bulk_lebaran_disbursement RPC</name>
  <files>supabase/migrations/046_create_lebaran_disbursement_cycles.sql</files>
  <action>
    - Buat migration file baru `supabase/migrations/046_create_lebaran_disbursement_cycles.sql` (melanjutkan urutan dari migration 045).
    - Definisikan tabel `public.lebaran_disbursement_cycles`:
      * `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
      * `cycle_name text NOT NULL` (e.g. 'Pencairan THR Idul Fitri 2026')
      * `cut_off_date timestamptz NOT NULL`
      * `total_members integer NOT NULL DEFAULT 0`
      * `total_amount numeric NOT NULL DEFAULT 0`
      * `status text NOT NULL DEFAULT 'DRAFT'` (CHECK status IN ('DRAFT', 'APPROVED', 'COMPLETED', 'REJECTED'))
      * `notes text`
      * `created_by uuid REFERENCES auth.users(id)`
      * `approved_by uuid REFERENCES auth.users(id)`
      * `approved_at timestamptz`
      * `created_at timestamptz DEFAULT now()`
      * `updated_at timestamptz DEFAULT now()`
    - Tambahkan indeks pada `status` dan `cut_off_date`.
    - Definisikan fungsi RPC `public.execute_bulk_lebaran_disbursement(p_cycle_id uuid, p_approver_id uuid)`:
      * Validasi keberadaan siklus dan pastikan status berhak dieksekusi ('DRAFT' atau 'APPROVED').
      * Kunci baris siklus dengan `SELECT ... FOR UPDATE`.
      * Temukan seluruh akun simpanan `member_deposits` yang terhubung ke jenis simpanan 'LEBARAN' / 'SL' / 'Hari Raya' untuk anggota berstatus aktif (`anggota.status = 'aktif'`).
      * Hitung saldo berjalan masing-masing anggota (SUM deposit - SUM withdrawal).
      * Filter hanya anggota yang memiliki saldo > 0.
      * Untuk setiap akun anggota:
        - Generate nomor referensi kwitansi unik: `KW-THR-[YEAR]-[NRP]`.
        - Insert transaksi penarikan ke `public.deposit_transactions`:
          * `member_deposit_id`: ID rekening simpanan lebaran anggota
          * `transaction_type`: 'withdrawal'
          * `amount`: Saldo riil saat itu (sehingga saldo menjadi Rp 0)
          * `reference_no`: `KW-THR-[YEAR]-[NRP]`
          * `description`: `Pencairan Massal Simpanan Lebaran - [cycle_name]`
          * `payment_method`: 'transfer'
          * `notes`: `Pencairan Massal Simpanan Lebaran`
          * `created_by`: p_approver_id
          * `created_at`: now()
      * Perbarui `lebaran_disbursement_cycles`:
        - `status = 'COMPLETED'`
        - `approved_by = p_approver_id`
        - `approved_at = now()`
        - `total_members = [jumlah anggota tercairkan]`
        - `total_amount = [total nominal dana cair]`
        - `updated_at = now()`
      * Catat mutasi batch ke `public.audit_logs` (jika tabel audit_logs tersedia).
      * Return JSONB: `{ "success": true, "cycle_id": p_cycle_id, "total_members": v_total_members, "total_amount": v_total_amount }`.
    - Berikan izin eksekusi (`GRANT EXECUTE`) kepada role `authenticated`.
  </action>
  <verify>
    Periksa sintaks SQL migration file valid, deklarasi variabel, exception handling, dan batasan integritas data terpenuhi.
  </verify>
  <done>
    Skema persistensi siklus pencairan dan RPC eksekusi massal atomik tersimpan di `supabase/migrations/046_create_lebaran_disbursement_cycles.sql`.
  </done>
</task>

## Must-Haves
- [ ] Tabel `lebaran_disbursement_cycles` lengkap dengan status, cut_off_date, pelacak pembuat & penyetuju.
- [ ] RPC `execute_bulk_lebaran_disbursement` mengunci baris, menghitung saldo riil simpanan lebaran, dan menyisipkan penarikan 100% sehingga saldo sisa Rp 0.
- [ ] Nomor referensi kwitansi unik berformat `KW-THR-[YEAR]-[NRP]`.
- [ ] Update status siklus menjadi 'COMPLETED' dan pencatatan jejak audit.

## Success Criteria
- [ ] Migration file PostgreSQL valid tanpa sintaks error.
- [ ] Transaksi batch dibungkus dalam blok atomik ACID.

