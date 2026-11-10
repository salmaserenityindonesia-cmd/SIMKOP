---
phase: 75
plan: 1
wave: 1
gap_closure: false
---

# Plan 75.1: Database Integrity & Auto-Fallback Trigger (PostgreSQL)

## Objective
Mengamankan integritas data nomor kwitansi pembayaran cicilan pinjaman pada tabel `public.loan_repayments` di PostgreSQL Supabase dengan menambahkan kolom `receipt_number` (jika belum ada) dan mengaktifkan trigger fallback otomatis anti-bentrok (`trg_loan_repayments_receipt`). Trigger ini bertindak sebagai jaring pengaman lapis database apabila frontend tidak mengirim nomor kwitansi atau terjadi request bersamaan/berulang pada hari yang sama.

## Context
Load these files for context:
- `supabase/migrations/040_add_sisa_pinjaman_and_paid_off_status.sql`
- `src/services/loanMatrixService.ts`

## Tasks

<task type="auto">
  <name>Create Migration Script for Loan Repayment Receipt Fallback Trigger</name>
  <files>
    supabase/migrations/041_add_loan_repayments_receipt_trigger.sql
  </files>
  <action>
    1. Buat file migrasi baru `supabase/migrations/041_add_loan_repayments_receipt_trigger.sql`:
       - Tambahkan kolom `receipt_number text` pada `public.loan_repayments` jika belum ada (`ADD COLUMN IF NOT EXISTS`).
       - Tambahkan index `idx_loan_repayments_receipt_number` untuk efisiensi query pencarian nomor kwitansi.
       - Buat fungsi trigger `public.fn_ensure_loan_receipt_number()`:
         ```sql
         -- ==============================================================================
         -- Migration: 041_add_loan_repayments_receipt_trigger.sql
         -- Deskripsi: Standarisasi penomoran kwitansi pelunasan pinjaman & trigger anti-bentrok
         -- ==============================================================================

         ALTER TABLE public.loan_repayments 
         ADD COLUMN IF NOT EXISTS receipt_number text;

         CREATE INDEX IF NOT EXISTS idx_loan_repayments_receipt_number 
         ON public.loan_repayments(receipt_number);

         CREATE OR REPLACE FUNCTION public.fn_ensure_loan_receipt_number()
         RETURNS TRIGGER AS $$
         DECLARE
           v_base text;
           v_candidate text;
           v_counter int := 1;
         BEGIN
           -- Jika frontend tidak mengirim receipt_number atau mengirim string kosong
           IF NEW.receipt_number IS NULL OR TRIM(NEW.receipt_number) = '' THEN
             v_base := 'KW-PINJ/' || COALESCE(NEW.loan_id::text, 'GEN') || '/' || TO_CHAR(NOW(), 'YYYYMMDD');
             v_candidate := v_base || '-' || UPPER(SUBSTRING(MD5(RANDOM()::text) FROM 1 FOR 3));
             
             -- Anti-collision loop
             WHILE EXISTS (SELECT 1 FROM public.loan_repayments WHERE receipt_number = v_candidate) LOOP
               v_counter := v_counter + 1;
               v_candidate := v_base || '-' || LPAD(v_counter::text, 3, '0');
             END LOOP;
             
             NEW.receipt_number := v_candidate;
           END IF;
           
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;

         DROP TRIGGER IF EXISTS trg_loan_repayments_receipt ON public.loan_repayments;
         CREATE TRIGGER trg_loan_repayments_receipt
         BEFORE INSERT ON public.loan_repayments
         FOR EACH ROW
         EXECUTE FUNCTION public.fn_ensure_loan_receipt_number();
         ```
  </action>
  <verify>
    Periksa sintaks SQL skrip migrasi `041_add_loan_repayments_receipt_trigger.sql` untuk memastikan tidak ada kesalahan deklarasi fungsi dan trigger PostgreSQL.
  </verify>
  <done>
    Skrip migrasi SQL `041_add_loan_repayments_receipt_trigger.sql` dibuat lengkap dengan struktur kolom, index pencarian, dan trigger anti-collision.
  </done>
</task>

## Success Criteria
- [ ] File migrasi `supabase/migrations/041_add_loan_repayments_receipt_trigger.sql` tersedia dan tervalidasi.
- [ ] Trigger `trg_loan_repayments_receipt` siap dieksekusi di Supabase PostgreSQL.
