-- Migration 022: Add member_discount_percentage to pos_settings table
ALTER TABLE public.pos_settings 
ADD COLUMN IF NOT EXISTS member_discount_percentage numeric NOT NULL DEFAULT 5.00 
CHECK (member_discount_percentage >= 0 AND member_discount_percentage <= 100);

COMMENT ON COLUMN public.pos_settings.member_discount_percentage IS 'Persentase diskon belanja otomatis untuk anggota koperasi (0 - 100%)';
