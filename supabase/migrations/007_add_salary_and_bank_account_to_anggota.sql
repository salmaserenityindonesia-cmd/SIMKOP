-- File: supabase/migrations/007_add_salary_and_bank_account_to_anggota.sql

-- 1. Tambah kolom take_home_pay dan bank_account_number ke tabel anggota
ALTER TABLE public.anggota 
ADD COLUMN IF NOT EXISTS take_home_pay NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS bank_account_number TEXT;

-- 2. Buat tabel untuk audit log perubahan rekening
CREATE TABLE IF NOT EXISTS public.rekening_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anggota_id UUID NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE,
    old_account_number TEXT,
    new_account_number TEXT,
    changed_by UUID, -- ID User (admin/operator) yang melakukan perubahan, referensi ke auth.users bisa nullable jika dilakukan sistem
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Mengaktifkan Row Level Security (RLS)
ALTER TABLE public.rekening_audit_logs ENABLE ROW LEVEL SECURITY;

-- Membuat policy (aturan akses) agar hanya Pengelola (Admin & Operator)
-- yang bisa melihat atau menambah log audit.
CREATE POLICY "Pengelola can manage rekening audit logs" 
ON public.rekening_audit_logs FOR ALL 
USING ( 
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
);
