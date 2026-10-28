-- Migration 021: Link Sales to Cashier Shifts and Ensure Cash Payment Columns
-- Ensures shift_id foreign key, indexing, and paid_amount column alignment on public.sales

-- 1. Ensure shift_id foreign key column on sales table
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL;

-- 2. Performance Index for shift-based sales lookups
CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON public.sales(shift_id);

-- 3. Ensure paid_amount and numeric cash precision columns
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;

-- 4. Ensure sale_status column exists and is typed appropriately
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'sales' 
          AND column_name = 'sale_status'
    ) THEN
        ALTER TABLE public.sales ADD COLUMN sale_status text DEFAULT 'completed';
    END IF;
END $$;

-- 5. Backfill existing sales where paid_amount is 0 or null
UPDATE public.sales
SET paid_amount = total_amount
WHERE (paid_amount IS NULL OR paid_amount = 0)
  AND total_amount > 0
  AND (paid_cash > 0 OR paid_deposit > 0);

