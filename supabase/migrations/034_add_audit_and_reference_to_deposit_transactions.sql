-- Migration: 034_add_audit_and_reference_to_deposit_transactions.sql
-- Description: Menambahkan kolom metadata bukti transaksi (reference_no, payment_method, notes, created_by)
--              pada tabel deposit_transactions serta trigger audit trail otomatis pada operasi DELETE ke audit_logs.

-- 1. Tambahkan kolom dokumentasi bukti pada deposit_transactions
ALTER TABLE public.deposit_transactions 
ADD COLUMN IF NOT EXISTS reference_no TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'tunai',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Buat index untuk pencarian cepat nomor bukti referensi dan periode
CREATE INDEX IF NOT EXISTS idx_deposit_tx_reference_no ON public.deposit_transactions(reference_no);
CREATE INDEX IF NOT EXISTS idx_deposit_tx_for_period ON public.deposit_transactions(member_deposit_id, for_year, for_month);

-- 3. Trigger otomatis pencatatan pembatalan/penghapusan centang ke audit_logs
CREATE OR REPLACE FUNCTION public.log_deposit_transaction_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_logs (
      table_name,
      action,
      record_id,
      entity_name,
      entity_id,
      old_data,
      performed_by,
      notes,
      created_at
    ) VALUES (
      'deposit_transactions',
      'DELETE',
      OLD.id::text,
      'deposit_transactions',
      OLD.member_deposit_id,
      row_to_json(OLD)::jsonb,
      auth.uid(),
      COALESCE(OLD.description, 'Penghapusan / Batal Centang Simpanan'),
      TIMEZONE('utc'::text, NOW())
    );
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_deposit_tx_delete ON public.deposit_transactions;
CREATE TRIGGER trg_audit_deposit_tx_delete
AFTER DELETE ON public.deposit_transactions
FOR EACH ROW EXECUTE FUNCTION public.log_deposit_transaction_changes();
