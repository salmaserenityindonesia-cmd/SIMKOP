-- File: supabase/migrations/006_create_loan_module.sql
-- Tujuan: Membuat skema database untuk modul pinjaman komprehensif (THP & FIFO)

-- 1. Tambahkan master_thp pada tabel anggota
ALTER TABLE public.anggota ADD COLUMN IF NOT EXISTS master_thp NUMERIC NOT NULL DEFAULT 0;

-- 2. Buat tabel loans
CREATE TABLE IF NOT EXISTS public.loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    tenor INTEGER NOT NULL,
    monthly_target NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'rejected', 'completed')),
    start_date DATE,
    approved_by UUID REFERENCES public.pengelola(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Buat tabel loan_schedules
CREATE TABLE IF NOT EXISTS public.loan_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    period_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    target_amount NUMERIC NOT NULL,
    paid_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid'))
);

-- 4. Buat tabel loan_repayments
CREATE TABLE IF NOT EXISTS public.loan_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES public.loan_schedules(id) ON DELETE CASCADE,
    amount_paid NUMERIC NOT NULL,
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    payment_method TEXT NOT NULL,
    notes TEXT
);

-- 5. Aktifkan Row Level Security (RLS)
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;

-- 6. Buat Policy untuk pengelola (Admin & Operator)
CREATE POLICY "Pengelola can manage loans" 
ON public.loans FOR ALL 
USING ( (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') );

CREATE POLICY "Pengelola can manage loan_schedules" 
ON public.loan_schedules FOR ALL 
USING ( (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') );

CREATE POLICY "Pengelola can manage loan_repayments" 
ON public.loan_repayments FOR ALL 
USING ( (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') );
