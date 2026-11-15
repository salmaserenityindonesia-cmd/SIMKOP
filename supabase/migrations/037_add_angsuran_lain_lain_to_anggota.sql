ALTER TABLE public.anggota
ADD COLUMN IF NOT EXISTS angsuran_lain_lain numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

NOTIFY pgrst, 'reload schema';
