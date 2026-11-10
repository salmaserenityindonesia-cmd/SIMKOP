-- File: supabase/migrations/039_add_updated_at_to_anggota.sql
-- Tujuan: Memastikan kolom updated_at tersedia pada tabel public.anggota 
--         dan memuat ulang skema cache PostgREST Supabase.

-- 1. Tambah kolom updated_at jika belum ada
ALTER TABLE public.anggota 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- 2. Muat ulang cache PostgREST Supabase
NOTIFY pgrst, 'reload schema';

