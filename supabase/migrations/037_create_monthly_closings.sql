-- Migration: 037_create_monthly_closings.sql
-- Description: Membuat tabel public.monthly_closings untuk Rekap Akhir Bulan & Berita Acara Rapat Evaluasi Bulanan Pengurus (Soft Archive)
--              serta fungsi helper public.is_admin() untuk kebijakan RLS.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.pengelola
      WHERE id = auth.uid()
        AND role = 'admin'
        AND COALESCE(is_active, true) = true
    )
  );
$$;

CREATE TABLE IF NOT EXISTS public.monthly_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  cutoff_date date NOT NULL,
  opening_cash_balance numeric NOT NULL DEFAULT 0,
  monthly_cash_in numeric NOT NULL DEFAULT 0,
  monthly_cash_out numeric NOT NULL DEFAULT 0,
  closing_cash_balance numeric NOT NULL DEFAULT 0,
  total_savings_balance numeric NOT NULL DEFAULT 0,
  savings_pokok numeric NOT NULL DEFAULT 0,
  savings_wajib numeric NOT NULL DEFAULT 0,
  savings_belanja numeric NOT NULL DEFAULT 0,
  savings_lebaran numeric NOT NULL DEFAULT 0,
  active_loan_count integer NOT NULL DEFAULT 0,
  total_loan_receivable numeric NOT NULL DEFAULT 0,
  total_store_credit_receivable numeric NOT NULL DEFAULT 0,
  inventory_valuation numeric NOT NULL DEFAULT 0,
  monthly_revenue numeric NOT NULL DEFAULT 0,
  monthly_cogs numeric NOT NULL DEFAULT 0,
  monthly_financing_margin numeric NOT NULL DEFAULT 0,
  monthly_opex numeric NOT NULL DEFAULT 0,
  monthly_net_shu numeric NOT NULL DEFAULT 0,
  ytd_net_shu numeric NOT NULL DEFAULT 0,
  minutes_number text,
  meeting_date date,
  attendees text,
  evaluation_notes text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_closings_year_month
  ON public.monthly_closings (fiscal_year, period_month);

ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active staff can read monthly closings" ON public.monthly_closings;
CREATE POLICY "Active staff can read monthly closings"
  ON public.monthly_closings FOR SELECT
  USING ((SELECT public.is_active_staff()));

DROP POLICY IF EXISTS "Admins can manage monthly closings" ON public.monthly_closings;
CREATE POLICY "Admins can manage monthly closings"
  ON public.monthly_closings FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

GRANT ALL ON TABLE public.monthly_closings TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
