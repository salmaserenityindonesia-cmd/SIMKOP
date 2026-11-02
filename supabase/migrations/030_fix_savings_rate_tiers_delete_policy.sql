-- Migration: Fix savings_rate_tiers delete policy
-- Pastikan tabel ada sebelum menerapkan kebijakan
CREATE TABLE IF NOT EXISTS public.savings_rate_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_type_code text NOT NULL, -- 'WAJIB', 'BELANJA', 'LEBARAN'
  start_year integer NOT NULL,
  start_month integer NOT NULL CHECK (start_month >= 1 AND start_month <= 12),
  end_year integer,
  end_month integer CHECK (end_month IS NULL OR (end_month >= 1 AND end_month <= 12)),
  monthly_rate numeric NOT NULL CHECK (monthly_rate > 0),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.savings_rate_tiers ENABLE ROW LEVEL SECURITY;

-- Pastikan policy DELETE terpasang eksplisit untuk user authenticated dan anon/service
DROP POLICY IF EXISTS "Allow authenticated delete on savings_rate_tiers" ON public.savings_rate_tiers;
CREATE POLICY "Allow authenticated delete on savings_rate_tiers"
  ON public.savings_rate_tiers FOR DELETE
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated manage on savings_rate_tiers" ON public.savings_rate_tiers;
CREATE POLICY "Allow authenticated manage on savings_rate_tiers"
  ON public.savings_rate_tiers FOR ALL
  USING (true)
  WITH CHECK (true);
