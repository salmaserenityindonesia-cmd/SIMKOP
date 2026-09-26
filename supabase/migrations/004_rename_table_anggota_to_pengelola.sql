-- File: supabase/migrations/004_rename_table_anggota_to_pengelola.sql
-- Tujuan: Me-rename tabel 'anggota' menjadi 'pengelola' untuk memisahkan domain 
-- antara staff pengelola (yang login ke sistem) dan anggota koperasi (konsumen/klien).

-- 1. Rename tabel
ALTER TABLE IF EXISTS public.anggota RENAME TO pengelola;

-- 2. Rename policy (Opsional, tapi direkomendasikan agar rapi)
-- Karena policy sulit di-rename langsung di Postgres, kita bisa mengabaikannya
-- atau jika mau rapi, drop dan create ulang policy-nya.

-- 3. Perbarui trigger function agar merujuk ke tabel pengelola
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
