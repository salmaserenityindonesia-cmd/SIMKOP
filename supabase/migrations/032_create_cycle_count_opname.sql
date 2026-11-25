-- Migration: 032_create_cycle_count_opname.sql
-- Description: Perpetual Cycle Counting (Stock Opname Bergilir Harian), Re-Count,
--              Jurnal Penyesuaian Opname, dan Pembaruan View v_inventory_mutations.

-- 1. Tambah kolom konfigurasi kuota harian opname per operator pada pos_settings
ALTER TABLE public.pos_settings
    ADD COLUMN IF NOT EXISTS daily_opname_quota integer NOT NULL DEFAULT 15
    CHECK (daily_opname_quota >= 1 AND daily_opname_quota <= 200);

-- 2. Tabel siklus Stock Opname (rotasi kategori penuh A -> Z + Tanpa Kategori)
CREATE TABLE IF NOT EXISTS public.stock_opname_cycles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_number integer NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

-- 3. Tabel penugasan harian, hasil hitung blind count, re-count, dan rekonsiliasi admin
CREATE TABLE IF NOT EXISTS public.stock_opname_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id uuid NOT NULL REFERENCES public.stock_opname_cycles(id) ON DELETE CASCADE,
    cycle_number integer NOT NULL,
    slot_index integer NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    category_group text NOT NULL DEFAULT 'Tanpa Kategori',
    assigned_operator_id uuid NOT NULL REFERENCES public.pengelola(id) ON DELETE CASCADE,
    reassigned_from_operator_id uuid REFERENCES public.pengelola(id) ON DELETE SET NULL,
    scheduled_date date NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'counted', 'recount_requested', 'recounted', 'resolved')),
    observed_qty integer CHECK (observed_qty IS NULL OR observed_qty >= 0),
    system_stock_snapshot integer,
    counted_at timestamptz,
    recount_operator_id uuid REFERENCES public.pengelola(id) ON DELETE SET NULL,
    recount_qty integer CHECK (recount_qty IS NULL OR recount_qty >= 0),
    recount_system_snapshot integer,
    recounted_at timestamptz,
    resolution_choice text CHECK (resolution_choice IN ('use_system', 'use_observed', 'use_recount')),
    final_approved_qty integer,
    applied_delta integer NOT NULL DEFAULT 0,
    unit_cost_snapshot numeric NOT NULL DEFAULT 0,
    variance_value numeric NOT NULL DEFAULT 0,
    resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_stock_opname_tasks_cycle_product UNIQUE (cycle_id, product_id)
);

-- 4. Tabel jurnal penyesuaian stok opname (suplai v_inventory_mutations & Estimasi SHU)
CREATE TABLE IF NOT EXISTS public.stock_opname_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES public.stock_opname_tasks(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    reference_no text NOT NULL UNIQUE,
    qty_in integer NOT NULL DEFAULT 0 CHECK (qty_in >= 0),
    qty_out integer NOT NULL DEFAULT 0 CHECK (qty_out >= 0),
    unit_cost numeric NOT NULL DEFAULT 0,
    total_value numeric NOT NULL DEFAULT 0,
    notes text,
    approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Indeks performa query
CREATE INDEX IF NOT EXISTS idx_stock_opname_tasks_cycle_id
    ON public.stock_opname_tasks(cycle_id);

CREATE INDEX IF NOT EXISTS idx_stock_opname_tasks_operator_date
    ON public.stock_opname_tasks(assigned_operator_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_stock_opname_tasks_recount_op
    ON public.stock_opname_tasks(recount_operator_id)
    WHERE status = 'recount_requested';

CREATE INDEX IF NOT EXISTS idx_stock_opname_tasks_status_date
    ON public.stock_opname_tasks(status, scheduled_date DESC);

CREATE INDEX IF NOT EXISTS idx_stock_opname_tasks_product_id
    ON public.stock_opname_tasks(product_id);

CREATE INDEX IF NOT EXISTS idx_stock_opname_adjustments_task_id
    ON public.stock_opname_adjustments(task_id);

CREATE INDEX IF NOT EXISTS idx_stock_opname_adjustments_product_created
    ON public.stock_opname_adjustments(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_opname_adjustments_created_at
    ON public.stock_opname_adjustments(created_at DESC);

-- 6. Perbarui view v_inventory_mutations agar menyertakan PENYESUAIAN_OPNAME
CREATE OR REPLACE VIEW public.v_inventory_mutations AS
-- 1. Barang Keluar: Penjualan Kasir POS
SELECT 
    si.id::TEXT AS mutation_id,
    s.created_at AS mutation_date,
    si.product_id AS product_id,
    'KELUAR_PENJUALAN'::TEXT AS mutation_type,
    'Penjualan Kasir'::TEXT AS type_label,
    s.sale_number::TEXT AS reference_number,
    0::INTEGER AS qty_in,
    si.qty::INTEGER AS qty_out,
    si.price::NUMERIC AS unit_price,
    COALESCE('Penjualan Kasir - ' || s.sale_number, 'Penjualan Kasir')::TEXT AS notes
FROM public.sale_items si
INNER JOIN public.sales s ON si.sale_id = s.id
WHERE COALESCE(s.sale_status, 'completed'::public.sale_status) = 'completed'::public.sale_status

UNION ALL

-- 2. Barang Masuk: Restock Faktur Pembelian Supplier
SELECT 
    pi.id::TEXT AS mutation_id,
    COALESCE(p.created_at, p.purchase_date::TIMESTAMPTZ, NOW()) AS mutation_date,
    pi.product_id AS product_id,
    'MASUK_PEMBELIAN'::TEXT AS mutation_type,
    'Restock Pembelian'::TEXT AS type_label,
    COALESCE(p.invoice_number, '-')::TEXT AS reference_number,
    pi.qty::INTEGER AS qty_in,
    0::INTEGER AS qty_out,
    pi.buy_price::NUMERIC AS unit_price,
    COALESCE('Restock Pembelian - Faktur: ' || p.invoice_number, 'Restock Pembelian')::TEXT AS notes
FROM public.purchase_items pi
INNER JOIN public.purchases p ON pi.purchase_id = p.id

UNION ALL

-- 3. Barang Keluar: Pengeluaran Retur ke Supplier
SELECT 
    pri.id::TEXT AS mutation_id,
    COALESCE(pr.created_at, pr.return_date::TIMESTAMPTZ, NOW()) AS mutation_date,
    pri.product_id AS product_id,
    'KELUAR_RETUR'::TEXT AS mutation_type,
    'Retur ke Supplier'::TEXT AS type_label,
    COALESCE(pr.return_number, '-')::TEXT AS reference_number,
    0::INTEGER AS qty_in,
    pri.qty::INTEGER AS qty_out,
    pri.cost_per_unit::NUMERIC AS unit_price,
    ('Retur ke Supplier - ' || COALESCE(pr.return_number, '-') || COALESCE(' (' || pr.notes || ')', ''))::TEXT AS notes
FROM public.purchase_return_items pri
INNER JOIN public.purchase_returns pr ON pri.return_id = pr.id

UNION ALL

-- 4. Barang Masuk: Penerimaan Fisik Barang Pengganti Retur Klaim Supplier
SELECT 
    (pri.id::TEXT || '-claim')::TEXT AS mutation_id,
    pr.replacement_received_at AS mutation_date,
    pri.product_id AS product_id,
    'MASUK_KLAIM_PENGGANTI'::TEXT AS mutation_type,
    'Penerimaan Klaim Pengganti'::TEXT AS type_label,
    COALESCE(pr.return_number, '-')::TEXT AS reference_number,
    pri.qty::INTEGER AS qty_in,
    0::INTEGER AS qty_out,
    pri.cost_per_unit::NUMERIC AS unit_price,
    ('Penerimaan Fisik Pengganti Retur - ' || COALESCE(pr.return_number, '-'))::TEXT AS notes
FROM public.purchase_return_items pri
INNER JOIN public.purchase_returns pr ON pri.return_id = pr.id
WHERE pr.claim_status = 'SELESAI_DIGANTI' 
  AND pr.replacement_received_at IS NOT NULL

UNION ALL

-- 5. Penyesuaian Selisih Stock Opname Harian
SELECT
    ('opn-' || soa.id::TEXT)::TEXT AS mutation_id,
    soa.created_at AS mutation_date,
    soa.product_id AS product_id,
    'PENYESUAIAN_OPNAME'::TEXT AS mutation_type,
    'Penyesuaian Opname'::TEXT AS type_label,
    soa.reference_no::TEXT AS reference_number,
    soa.qty_in::INTEGER AS qty_in,
    soa.qty_out::INTEGER AS qty_out,
    soa.unit_cost::NUMERIC AS unit_price,
    COALESCE(soa.notes, 'Penyesuaian Stock Opname - ' || soa.reference_no)::TEXT AS notes
FROM public.stock_opname_adjustments soa;

COMMENT ON VIEW public.v_inventory_mutations IS 'Unified Inventory Mutation View menyatukan riwayat barang masuk & keluar (penjualan kasir, pembelian restock, retur supplier, klaim pengganti, dan penyesuaian stock opname).';

GRANT SELECT ON public.v_inventory_mutations TO authenticated;
GRANT SELECT ON public.v_inventory_mutations TO anon;
GRANT SELECT ON public.v_inventory_mutations TO service_role;

-- 7. RPC aman untuk membaca daftar operator opname lintas-role staff (karena RLS pengelola membatasi operator membaca user lain)
CREATE OR REPLACE FUNCTION public.get_opname_operators()
RETURNS TABLE (
    id uuid,
    nama text,
    role text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_active_staff() THEN
        RAISE EXCEPTION 'Unauthorized: Hanya staf aktif yang diizinkan mengakses daftar operator opname.';
    END IF;

    RETURN QUERY
    SELECT p.id, p.nama, p.role, p.created_at
    FROM public.pengelola p
    WHERE p.role IN ('operator', 'kasir')
    ORDER BY p.created_at ASC, p.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_opname_operators() TO authenticated;

-- 8. Row Level Security (RLS)
ALTER TABLE public.stock_opname_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_opname_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_opname_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage stock_opname_cycles" ON public.stock_opname_cycles;
CREATE POLICY "Staff can manage stock_opname_cycles"
    ON public.stock_opname_cycles
    FOR ALL
    TO authenticated
    USING ((SELECT public.is_active_staff()))
    WITH CHECK ((SELECT public.is_active_staff()));

DROP POLICY IF EXISTS "Staff can manage stock_opname_tasks" ON public.stock_opname_tasks;
CREATE POLICY "Staff can manage stock_opname_tasks"
    ON public.stock_opname_tasks
    FOR ALL
    TO authenticated
    USING ((SELECT public.is_active_staff()))
    WITH CHECK ((SELECT public.is_active_staff()));

DROP POLICY IF EXISTS "Staff can view stock_opname_adjustments" ON public.stock_opname_adjustments;
CREATE POLICY "Staff can view stock_opname_adjustments"
    ON public.stock_opname_adjustments
    FOR SELECT
    TO authenticated
    USING ((SELECT public.is_active_staff()));

DROP POLICY IF EXISTS "Admin can write stock_opname_adjustments" ON public.stock_opname_adjustments;
CREATE POLICY "Admin can write stock_opname_adjustments"
    ON public.stock_opname_adjustments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.pengelola
            WHERE id = (SELECT auth.uid()) AND role = 'admin'
        )
        OR ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    );

DROP POLICY IF EXISTS "Admin can update stock_opname_adjustments" ON public.stock_opname_adjustments;
CREATE POLICY "Admin can update stock_opname_adjustments"
    ON public.stock_opname_adjustments
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.pengelola
            WHERE id = (SELECT auth.uid()) AND role = 'admin'
        )
        OR ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.pengelola
            WHERE id = (SELECT auth.uid()) AND role = 'admin'
        )
        OR ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    );

DROP POLICY IF EXISTS "Admin can delete stock_opname_adjustments" ON public.stock_opname_adjustments;
CREATE POLICY "Admin can delete stock_opname_adjustments"
    ON public.stock_opname_adjustments
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.pengelola
            WHERE id = (SELECT auth.uid()) AND role = 'admin'
        )
        OR ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    );
