-- Migration 017: Create koperasi_profile table for application settings & receipt header configuration
CREATE TABLE IF NOT EXISTS public.koperasi_profile (
  id integer PRIMARY KEY DEFAULT 1,
  nama_koperasi text NOT NULL DEFAULT 'KOPERASI PRIMKOPPOL',
  alamat text NOT NULL DEFAULT 'Jl. Jaksa Agung Suprapto No. 10, Ngawi',
  telepon text DEFAULT '(0354)7654321',
  terminal_name text DEFAULT 'POS Terminal #01',
  footer_notes text DEFAULT 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT single_row_check CHECK (id = 1)
);

-- Enable RLS
ALTER TABLE public.koperasi_profile ENABLE ROW LEVEL SECURITY;

-- Policies (Idempotent)
DROP POLICY IF EXISTS "Allow public read on koperasi_profile" ON public.koperasi_profile;
CREATE POLICY "Allow public read on koperasi_profile"
  ON public.koperasi_profile FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert/update on koperasi_profile" ON public.koperasi_profile;
CREATE POLICY "Allow authenticated insert/update on koperasi_profile"
  ON public.koperasi_profile FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Seed data awal
INSERT INTO public.koperasi_profile (id, nama_koperasi, alamat, telepon, terminal_name, footer_notes)
VALUES (1, 'KOPERASI PRIMKOPPOL', 'Jl. Jaksa Agung Suprapto No. 10, Ngawi', '(0354)7654321', 'POS Terminal #01', 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan')
ON CONFLICT (id) DO NOTHING;

