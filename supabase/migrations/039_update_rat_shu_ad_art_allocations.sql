ALTER TABLE public.rat_shu_settings
ADD COLUMN IF NOT EXISTS member_borrower_pct numeric(5,2) NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS member_depositor_pct numeric(5,2) NOT NULL DEFAULT 25,
ADD COLUMN IF NOT EXISTS management_fund_pct numeric(5,2) NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS employee_fund_pct numeric(5,2) NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS social_fund_pct numeric(5,2) NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS education_fund_pct numeric(5,2) NOT NULL DEFAULT 5;

ALTER TABLE public.rat_shu_settings
ALTER COLUMN reserve_fund_pct SET DEFAULT 20,
ALTER COLUMN member_shu_pct SET DEFAULT 55,
ALTER COLUMN other_fund_pct SET DEFAULT 25;

-- Sinkronkan baris konfigurasi yang belum dikunci ke default AD/ART baru
UPDATE public.rat_shu_settings s
SET
  reserve_fund_pct = 20,
  member_borrower_pct = 30,
  member_depositor_pct = 25,
  management_fund_pct = 10,
  employee_fund_pct = 5,
  social_fund_pct = 5,
  education_fund_pct = 5,
  member_shu_pct = 55,
  other_fund_pct = 25,
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.fiscal_year_closings c
  WHERE c.fiscal_year = s.fiscal_year AND c.status = 'CLOSED'
);

ALTER TABLE public.fiscal_year_closings
ADD COLUMN IF NOT EXISTS member_borrower_pct numeric(5,2) NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS member_depositor_pct numeric(5,2) NOT NULL DEFAULT 25,
ADD COLUMN IF NOT EXISTS management_fund_pct numeric(5,2) NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS employee_fund_pct numeric(5,2) NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS social_fund_pct numeric(5,2) NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS education_fund_pct numeric(5,2) NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS member_borrower_amount numeric(15,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS member_depositor_amount numeric(15,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS management_fund_amount numeric(15,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS employee_fund_amount numeric(15,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS social_fund_amount numeric(15,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS education_fund_amount numeric(15,2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
