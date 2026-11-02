-- Migration 031: Create savings_rate_tiers table for tiered historical deposit rates
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

-- Enable Row Level Security
ALTER TABLE public.savings_rate_tiers ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DROP POLICY IF EXISTS "Allow public read on savings_rate_tiers" ON public.savings_rate_tiers;
CREATE POLICY "Allow public read on savings_rate_tiers"
  ON public.savings_rate_tiers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated manage on savings_rate_tiers" ON public.savings_rate_tiers;
CREATE POLICY "Allow authenticated manage on savings_rate_tiers"
  ON public.savings_rate_tiers FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Index for lookup efficiency
CREATE INDEX IF NOT EXISTS idx_savings_rate_tiers_lookup 
  ON public.savings_rate_tiers (deposit_type_code, start_year, start_month);

-- Seed data awal riwayat Simpanan Wajib, Belanja, dan Lebaran
INSERT INTO public.savings_rate_tiers (deposit_type_code, start_year, start_month, end_year, end_month, monthly_rate, notes)
VALUES 
  ('WAJIB', 2024, 1, 2025, 10, 150000, 'Tarif Simpanan Wajib Lama (Rp 150.000)'),
  ('WAJIB', 2025, 11, NULL, NULL, 200000, 'Tarif Simpanan Wajib Baru (Rp 200.000)'),
  ('BELANJA', 2024, 1, NULL, NULL, 25000, 'Tarif Simpanan Belanja Standar (Rp 25.000)'),
  ('LEBARAN', 2024, 1, NULL, NULL, 50000, 'Tarif Simpanan Hari Raya/Lebaran Standar (Rp 50.000)')
ON CONFLICT DO NOTHING;
