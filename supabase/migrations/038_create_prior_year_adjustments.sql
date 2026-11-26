-- Migration: 038_create_prior_year_adjustments.sql
-- Description: Membuat tabel public.prior_year_adjustments untuk mencatat Jurnal Penyesuaian Awal Tahun Buku Baru
--              (Koreksi Pasca-RAT per 1 Januari) tanpa membuka kunci tahun buku lama yang berstatus CLOSED.

CREATE TABLE IF NOT EXISTS public.prior_year_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closed_fiscal_year integer NOT NULL,
  effective_year integer NOT NULL,
  effective_date date NOT NULL,
  adjustment_target text NOT NULL CHECK (adjustment_target IN ('CASH_VAULT', 'MEMBER_SAVINGS', 'RESERVE_EQUITY')),
  direction text NOT NULL CHECK (direction IN ('INCREASE', 'DECREASE')),
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  member_id uuid REFERENCES public.anggota(id) ON DELETE SET NULL,
  deposit_type_code text,
  reference_no text NOT NULL,
  reason text NOT NULL,
  cash_flow_id uuid,
  deposit_transaction_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prior_year_adjustments_closed_year
  ON public.prior_year_adjustments (closed_fiscal_year, created_at DESC);

ALTER TABLE public.prior_year_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active staff can view prior year adjustments" ON public.prior_year_adjustments;
CREATE POLICY "Active staff can view prior year adjustments"
  ON public.prior_year_adjustments FOR SELECT
  USING ((SELECT public.is_active_staff()));

DROP POLICY IF EXISTS "Admins can insert prior year adjustments" ON public.prior_year_adjustments;
CREATE POLICY "Admins can insert prior year adjustments"
  ON public.prior_year_adjustments FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));

GRANT ALL ON TABLE public.prior_year_adjustments TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
