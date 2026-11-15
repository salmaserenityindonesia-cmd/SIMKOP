ALTER TABLE public.anggota
ADD COLUMN IF NOT EXISTS angsuran_lain_lain numeric NOT NULL DEFAULT 0;
