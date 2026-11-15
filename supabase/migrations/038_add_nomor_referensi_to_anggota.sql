ALTER TABLE public.anggota
ADD COLUMN IF NOT EXISTS nomor_referensi text;

NOTIFY pgrst, 'reload schema';
