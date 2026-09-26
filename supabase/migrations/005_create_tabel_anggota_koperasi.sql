-- File: supabase/migrations/005_create_tabel_anggota_koperasi.sql
-- Tujuan: Membuat tabel khusus untuk Anggota Koperasi (nasabah) yang melakukan 
-- simpan pinjam dan transaksi lainnya (tidak memiliki akses login).

CREATE TABLE IF NOT EXISTS public.anggota (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nrp TEXT UNIQUE NOT NULL,    -- Nomor Registrasi Pokok (NRP)
    nama TEXT NOT NULL,          -- Nama Lengkap Anggota
    pangkat TEXT,                -- Pangkat Anggota
    status TEXT DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif')), -- Status keanggotaan
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Mengaktifkan Row Level Security (RLS)
ALTER TABLE public.anggota ENABLE ROW LEVEL SECURITY;

-- Membuat policy (aturan akses) agar hanya Pengelola (Admin & Operator)
-- yang bisa melihat, menambah, mengubah, atau menghapus data anggota.
CREATE POLICY "Pengelola can manage anggota" 
ON public.anggota FOR ALL 
USING ( 
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
);
