-- ==============================================================================
-- Migration: 041_add_loan_repayments_receipt_trigger.sql
-- Deskripsi: Standarisasi penomoran kwitansi pelunasan pinjaman & trigger anti-bentrok
-- ==============================================================================

ALTER TABLE public.loan_repayments 
ADD COLUMN IF NOT EXISTS receipt_number text;

CREATE INDEX IF NOT EXISTS idx_loan_repayments_receipt_number 
ON public.loan_repayments(receipt_number);

CREATE OR REPLACE FUNCTION public.fn_ensure_loan_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_counter int := 1;
BEGIN
  -- Jika frontend tidak mengirim receipt_number atau mengirim string kosong
  IF NEW.receipt_number IS NULL OR TRIM(NEW.receipt_number) = '' THEN
    v_base := 'KW-PINJ/' || COALESCE(NEW.loan_id::text, 'GEN') || '/' || TO_CHAR(NOW(), 'YYYYMMDD');
    v_candidate := v_base || '-' || UPPER(SUBSTRING(MD5(RANDOM()::text) FROM 1 FOR 3));
    
    -- Anti-collision loop
    WHILE EXISTS (SELECT 1 FROM public.loan_repayments WHERE receipt_number = v_candidate) LOOP
      v_counter := v_counter + 1;
      v_candidate := v_base || '-' || LPAD(v_counter::text, 3, '0');
    END LOOP;
    
    NEW.receipt_number := v_candidate;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loan_repayments_receipt ON public.loan_repayments;
CREATE TRIGGER trg_loan_repayments_receipt
BEFORE INSERT ON public.loan_repayments
FOR EACH ROW
EXECUTE FUNCTION public.fn_ensure_loan_receipt_number();
