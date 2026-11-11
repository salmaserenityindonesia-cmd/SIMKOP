-- Migration 045: Add min_remaining_thp and min_thp_rat_notes to koperasi_profile
ALTER TABLE public.koperasi_profile
ADD COLUMN IF NOT EXISTS min_remaining_thp numeric NOT NULL DEFAULT 1500000;

ALTER TABLE public.koperasi_profile
ADD COLUMN IF NOT EXISTS min_thp_rat_notes text DEFAULT 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000';

-- Update existing default profile row if it exists
UPDATE public.koperasi_profile
SET 
  min_remaining_thp = COALESCE(min_remaining_thp, 1500000),
  min_thp_rat_notes = COALESCE(min_thp_rat_notes, 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000')
WHERE id = 1;
