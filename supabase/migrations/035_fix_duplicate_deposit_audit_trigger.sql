-- Migration: 035_fix_duplicate_deposit_audit_trigger.sql
-- Description: Mencegah duplikasi log pembatalan pada deposit_transactions
--              antara trigger PostgreSQL dan aplikasi frontend.

CREATE OR REPLACE FUNCTION public.log_deposit_transaction_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    -- Mencegah pencatatan ganda jika log pembatalan telah dicatat oleh aplikasi dalam rentang 10 detik terakhir
    IF EXISTS (
      SELECT 1 FROM public.audit_logs 
      WHERE table_name = 'deposit_transactions' 
        AND action = 'DELETE' 
        AND record_id = OLD.id::text 
        AND created_at >= (NOW() - INTERVAL '10 seconds')
    ) THEN
      RETURN OLD;
    END IF;

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
