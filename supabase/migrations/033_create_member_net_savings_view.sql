-- Migration: 033_create_member_net_savings_view.sql
-- Description: View posisi saldo kas riil anggota per jenis simpanan (view_member_net_savings)
--              Menghitung total setoran, total penarikan, dan saldo kas riil (netto)
--              berdasarkan riwayat transaksi di deposit_transactions.
-- Phase: 54

CREATE OR REPLACE VIEW public.view_member_net_savings AS
SELECT 
    m.id AS member_id,
    m.nrp AS nrp,
    m.nama AS nama,
    dt.id AS deposit_type_id,
    dt.code AS deposit_type_code,
    dt.name AS deposit_type_name,
    COALESCE(SUM(CASE WHEN tx.transaction_type = 'deposit' THEN tx.amount ELSE 0 END), 0)::NUMERIC AS total_deposited,
    COALESCE(SUM(CASE WHEN tx.transaction_type = 'withdrawal' THEN tx.amount ELSE 0 END), 0)::NUMERIC AS total_withdrawn,
    COALESCE(SUM(
        CASE 
            WHEN tx.transaction_type = 'deposit' THEN tx.amount 
            WHEN tx.transaction_type = 'withdrawal' THEN -tx.amount 
            ELSE 0 
        END
    ), 0)::NUMERIC AS net_cash_balance
FROM public.anggota m
LEFT JOIN public.member_deposits md ON md.member_id = m.id
LEFT JOIN public.deposit_types dt ON dt.id = md.deposit_type_id
LEFT JOIN public.deposit_transactions tx ON tx.member_deposit_id = md.id
WHERE dt.code IS NOT NULL
GROUP BY m.id, m.nrp, m.nama, dt.id, dt.code, dt.name;

-- Berikan hak akses SELECT kepada authenticated dan anon
GRANT SELECT ON public.view_member_net_savings TO authenticated, anon;
