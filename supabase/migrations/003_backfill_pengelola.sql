-- File: supabase/migrations/003_backfill_pengelola.sql
-- Tujuan: Menyinkronkan ulang data dari tabel auth.users ke tabel public.pengelola.
-- Ini berguna untuk memasukkan user lama (seperti 'kasir') yang terdaftar 
-- sebelum tabel pengelola dan trigger otomatis dibuat.

INSERT INTO public.pengelola (id, nama, role)
SELECT 
    id,
    COALESCE(raw_user_meta_data->>'nama', split_part(email, '@', 1)) AS nama,
    COALESCE(raw_app_meta_data->>'role', 'operator') AS role
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.pengelola)
ON CONFLICT (id) DO NOTHING;
