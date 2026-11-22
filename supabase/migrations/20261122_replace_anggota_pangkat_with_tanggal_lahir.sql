ALTER TABLE public.anggota
  ADD COLUMN IF NOT EXISTS tanggal_lahir DATE;

-- Hapus kolom pangkat yang sudah tidak digunakan agar skema bersih
ALTER TABLE public.anggota
  DROP COLUMN IF EXISTS pangkat;
