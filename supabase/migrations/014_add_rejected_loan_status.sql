-- Menambahkan status 'rejected' (ditolak) ke dalam tipe ENUM loan_status
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loan_status') THEN
    ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'rejected';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
