CREATE TABLE IF NOT EXISTS public.member_lebaran_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE,
  effective_year integer NOT NULL,
  effective_month integer NOT NULL CHECK (effective_month >= 1 AND effective_month <= 12),
  monthly_rate numeric NOT NULL CHECK (monthly_rate > 0),
  cycle_label text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT member_lebaran_rates_member_period_key UNIQUE (member_id, effective_year, effective_month)
);

CREATE INDEX IF NOT EXISTS idx_member_lebaran_rates_member_id
  ON public.member_lebaran_rates(member_id);

ALTER TABLE public.member_lebaran_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read on member_lebaran_rates"
  ON public.member_lebaran_rates FOR SELECT USING (true);

CREATE POLICY "Allow authenticated manage on member_lebaran_rates"
  ON public.member_lebaran_rates FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
