-- File: supabase/migrations/002_create_schema.sql
-- Tujuan: Membuat tabel 'pengelola' (profil admin/operator), 'user_restrictions', dan trigger otomatis.

-- 1. Buat tabel pengelola (menggantikan fungsi tabel profiles bawaan)
CREATE TABLE IF NOT EXISTS public.pengelola (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    nama TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Buat tabel user_restrictions
CREATE TABLE IF NOT EXISTS public.user_restrictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.pengelola(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    is_allowed BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, feature_key)
);

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.pengelola ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;

-- 4. Buat Policy untuk pengelola
-- Admin bisa melihat dan mengubah semua data pengelola
CREATE POLICY "Admin can view all pengelola" 
ON public.pengelola FOR SELECT 
USING ( (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Admin can insert pengelola" 
ON public.pengelola FOR INSERT 
WITH CHECK ( (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Admin can update pengelola" 
ON public.pengelola FOR UPDATE 
USING ( (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- Operator hanya bisa melihat datanya sendiri
CREATE POLICY "Users can view own profile" 
ON public.pengelola FOR SELECT 
USING ( auth.uid() = id );

-- 5. Trigger otomatis insert ke tabel pengelola setiap ada user baru
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.pengelola (id, nama, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nama', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_app_meta_data->>'role', 'operator')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hapus trigger jika sudah ada sebelumnya, lalu buat ulang
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
