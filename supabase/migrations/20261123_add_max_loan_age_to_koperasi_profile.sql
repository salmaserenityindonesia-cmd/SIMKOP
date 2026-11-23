ALTER TABLE public.koperasi_profile
ADD COLUMN IF NOT EXISTS max_loan_age_years INTEGER NOT NULL DEFAULT 58;

UPDATE public.koperasi_profile
SET max_loan_age_years = 58
WHERE max_loan_age_years IS NULL OR max_loan_age_years <= 0;
