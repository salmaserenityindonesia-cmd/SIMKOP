-- File: supabase/migrations/001_set_initial_admin.sql
-- Tujuan: Menetapkan role 'admin' untuk akun pertama (salmaserenityindonesia@gmail.com)

-- 1. Update metadata otentikasi Supabase untuk mengizinkan pengecekan JWT claim role
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
WHERE email = 'salmaserenityindonesia@gmail.com';

-- 2. Upsert ke tabel 'pengelola' (sebagai data profil) yang digunakan oleh aplikasi
INSERT INTO public.pengelola (id, nama, role)
SELECT 
    id, 
    'Salma Serenity Indonesia' AS nama, 
    'admin' AS role
FROM auth.users
WHERE email = 'salmaserenityindonesia@gmail.com'
ON CONFLICT (id) DO UPDATE 
SET role = 'admin', nama = EXCLUDED.nama;
