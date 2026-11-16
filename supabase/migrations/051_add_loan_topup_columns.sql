ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS refinanced_loan_id uuid REFERENCES public.loans(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS topup_settlement_amount numeric NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
