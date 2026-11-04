-- Migration: 032_allow_delete_deposit_transactions_policy.sql
-- Aktifkan RLS dan pastikan policy DELETE & ALL tersedia untuk deposit_transactions

ALTER TABLE public.deposit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow delete on deposit_transactions" ON public.deposit_transactions;
CREATE POLICY "Allow delete on deposit_transactions" 
  ON public.deposit_transactions 
  FOR DELETE 
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Allow all on deposit_transactions" ON public.deposit_transactions;
CREATE POLICY "Allow all on deposit_transactions"
  ON public.deposit_transactions
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

