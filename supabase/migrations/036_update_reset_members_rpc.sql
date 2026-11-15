-- Migration: 036_update_reset_members_rpc.sql
-- Description: Pembaruan fungsi PostgreSQL RPC atomik reset_members_and_financial_records()
--              agar mencakup seluruh relasi anak terbaru (termasuk lebaran_disbursement_items)
--              serta menetapkan statement_timeout yang memadai untuk penghapusan mutasi besar.

CREATE OR REPLACE FUNCTION public.reset_members_and_financial_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  deleted_members_count integer;
  deleted_loans_count integer;
  deleted_deposits_count integer;
BEGIN
  DELETE FROM public.loan_repayments WHERE id IS NOT NULL;
  DELETE FROM public.loan_installments WHERE id IS NOT NULL;
  DELETE FROM public.loan_schedules WHERE id IS NOT NULL;
  DELETE FROM public.loans WHERE id IS NOT NULL;
  GET DIAGNOSTICS deleted_loans_count = ROW_COUNT;

  DELETE FROM public.deposit_transactions WHERE id IS NOT NULL;
  DELETE FROM public.member_deposits WHERE id IS NOT NULL;
  GET DIAGNOSTICS deleted_deposits_count = ROW_COUNT;

  DELETE FROM public.lebaran_disbursement_items WHERE id IS NOT NULL;
  DELETE FROM public.rekening_audit_logs WHERE id IS NOT NULL;
  DELETE FROM public.member_clearance_logs WHERE id IS NOT NULL;

  UPDATE public.sales SET member_id = NULL WHERE member_id IS NOT NULL;

  DELETE FROM public.anggota WHERE id IS NOT NULL;
  GET DIAGNOSTICS deleted_members_count = ROW_COUNT;

  DELETE FROM public.members WHERE id IS NOT NULL;

  INSERT INTO public.audit_logs (table_name, action, record_id, notes)
  VALUES ('anggota', 'RESET_ALL', 'SYSTEM', 'Admin melakukan reset massal seluruh data anggota, simpanan, dan pinjaman.');

  RETURN jsonb_build_object(
    'success', true,
    'members_deleted', deleted_members_count,
    'loans_deleted', deleted_loans_count,
    'deposits_deleted', deleted_deposits_count,
    'message', 'Seluruh data anggota, simpanan, dan pinjaman berhasil dikosongkan.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_members_and_financial_records() TO authenticated, anon;
