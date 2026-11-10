-- Migration 040: Add sisa_pinjaman column and update status check constraint on public.loans
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS sisa_pinjaman NUMERIC;

DO $$
BEGIN
    -- Drop existing check constraint if present
    ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_status_check;
    
    -- Re-add check constraint including 'paid_off'
    ALTER TABLE public.loans ADD CONSTRAINT loans_status_check 
      CHECK (status IN ('draft', 'pending', 'approved', 'active', 'rejected', 'completed', 'paid_off', 'defaulted'));
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint adjustment bypassed: %', SQLERRM;
END $$;

