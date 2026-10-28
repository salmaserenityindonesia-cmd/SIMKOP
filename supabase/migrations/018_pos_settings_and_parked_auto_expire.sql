-- Migration 018: POS Settings, Parked Sales Expiration & Auto-Restock RPC

-- 1. Create pos_settings table
CREATE TABLE IF NOT EXISTS public.pos_settings (
    id integer PRIMARY KEY DEFAULT 1,
    max_hold_duration_minutes integer NOT NULL DEFAULT 120,
    allow_negative_stock boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT single_pos_setting CHECK (id = 1)
);

-- Enable RLS on pos_settings
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow public read on pos_settings" ON public.pos_settings;
CREATE POLICY "Allow public read on pos_settings"
    ON public.pos_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert/update on pos_settings" ON public.pos_settings;
CREATE POLICY "Allow authenticated insert/update on pos_settings"
    ON public.pos_settings FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Initial Seed Data
INSERT INTO public.pos_settings (id, max_hold_duration_minutes, allow_negative_stock)
VALUES (1, 120, false)
ON CONFLICT (id) DO NOTHING;

-- 2. Add columns to sales and sale_items to ensure cross-compatibility
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_status text DEFAULT 'completed';

-- Synchronize status & sale_status if any
UPDATE public.sales SET status = sale_status WHERE status IS NULL AND sale_status IS NOT NULL;
UPDATE public.sales SET sale_status = status WHERE sale_status IS NULL AND status IS NOT NULL;

-- Ensure quantity and qty are both present in sale_items
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS quantity integer;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS qty integer;
UPDATE public.sale_items SET quantity = qty WHERE quantity IS NULL AND qty IS NOT NULL;
UPDATE public.sale_items SET qty = quantity WHERE qty IS NULL AND quantity IS NOT NULL;

-- 3. Stored Procedure / RPC for Auto-Restock of Expired Parked Sales
CREATE OR REPLACE FUNCTION public.cleanup_expired_parked_sales()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_count INT := 0;
BEGIN
    FOR v_sale IN 
        SELECT id FROM public.sales
        WHERE (COALESCE(status, '') = 'parked' OR COALESCE(sale_status, '') = 'parked')
          AND expires_at IS NOT NULL
          AND expires_at < now()
    LOOP
        -- Restock each item back to products inventory
        FOR v_item IN
            SELECT product_id, COALESCE(quantity, qty, 0) AS qty_restock
            FROM public.sale_items
            WHERE sale_id = v_sale.id AND product_id IS NOT NULL
        LOOP
            UPDATE public.products
            SET stock = stock + v_item.qty_restock
            WHERE id = v_item.product_id;
        END LOOP;

        -- Update sales status to cancelled
        UPDATE public.sales
        SET status = 'cancelled',
            sale_status = 'cancelled'
        WHERE id = v_sale.id;

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'cleaned_count', v_count);
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.cleanup_expired_parked_sales() TO authenticated, anon, service_role;
