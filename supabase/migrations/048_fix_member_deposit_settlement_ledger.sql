-- File: supabase/migrations/048_fix_member_deposit_settlement_ledger.sql
-- Tujuan: Memperbaiki fungsi get_member_deposit_settlement agar menghitung saldo bersih
-- berdasarkan transaction_type ('deposit' dikurangi 'withdrawal'), bukan SUM(amount) mentah.

CREATE OR REPLACE FUNCTION public.get_member_deposit_settlement(p_member_id UUID)
RETURNS TABLE (
    deposit_name TEXT,
    can_be_withdrawn BOOLEAN,
    total_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dt.name AS deposit_name,
        dt.can_be_withdrawn,
        GREATEST(
            0,
            COALESCE(
                SUM(
                    CASE 
                        WHEN tx.transaction_type = 'deposit' THEN tx.amount
                        ELSE -tx.amount
                    END
                ),
                0
            )
        ) AS total_amount
    FROM public.member_deposits md
    JOIN public.deposit_types dt ON dt.id = md.deposit_type_id
    LEFT JOIN public.deposit_transactions tx ON tx.member_deposit_id = md.id
    WHERE md.member_id = p_member_id
    GROUP BY dt.name, dt.can_be_withdrawn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
