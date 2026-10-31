-- Migration 029: Add logo_url to koperasi_profile table
ALTER TABLE public.koperasi_profile 
ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.koperasi_profile.logo_url IS 'URL publik Cloudinary untuk logo resmi koperasi';
