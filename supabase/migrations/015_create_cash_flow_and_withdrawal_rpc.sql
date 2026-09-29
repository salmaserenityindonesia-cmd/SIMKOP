-- File: supabase/migrations/015_create_cash_flow_and_withdrawal_rpc.sql
-- Tujuan: Membuat tabel cash_flow dan RPC untuk transaksi penarikan atomik

CREATE TABLE IF NOT EXISTS public.cash_flow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    amount NUMERIC NOT NULL,
    category TEXT NOT NULL,
    reference_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pengelola can manage cash_flow" 
ON public.cash_flow FOR ALL 
USING ( 
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
);

-- RPC for atomic withdrawal
CREATE OR REPLACE FUNCTION public.withdraw_savings_atomic(
    p_member_deposit_id UUID,
    p_amount NUMERIC,
    p_description TEXT,
    p_payment_method TEXT
) RETURNS JSON AS $$
DECLARE
    v_saldo NUMERIC;
    v_tx_id UUID;
BEGIN
    -- Hitung saldo
    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE -amount END), 0)
    INTO v_saldo
    FROM public.deposit_transactions
    WHERE member_deposit_id = p_member_deposit_id;

    IF v_saldo < p_amount THEN
        RAISE EXCEPTION 'Saldo tidak mencukupi untuk penarikan';
    END IF;

    -- Insert withdrawal
    INSERT INTO public.deposit_transactions (
        member_deposit_id,
        transaction_type,
        amount,
        description
    ) VALUES (
        p_member_deposit_id,
        'withdrawal',
        p_amount,
        p_description
    ) RETURNING id INTO v_tx_id;

    -- Insert cash flow out
    INSERT INTO public.cash_flow (
        direction,
        amount,
        category,
        reference_id
    ) VALUES (
        'out',
        p_amount,
        'penarikan_simpanan',
        v_tx_id
    );

    RETURN json_build_object('success', true, 'transaction_id', v_tx_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
