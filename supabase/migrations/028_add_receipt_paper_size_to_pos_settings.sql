-- Migration 028: Add receipt_paper_size to pos_settings table
ALTER TABLE public.pos_settings 
ADD COLUMN IF NOT EXISTS receipt_paper_size text NOT NULL DEFAULT '80mm' 
CHECK (receipt_paper_size IN ('58mm', '80mm'));

COMMENT ON COLUMN public.pos_settings.receipt_paper_size IS 'Ukuran kertas thermal printer kasir (58mm atau 80mm)';
