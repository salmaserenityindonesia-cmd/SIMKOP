-- ==============================================================================
-- Migration 019: Fix Abnormal Product Prices, Audit, and Constraints
-- Tujuan:
-- 1. Mendeteksi dan membersihkan data anomali buy_price / stock pada public.products
--    (misal: barcode 13-digit EAN atau kelebihan digit nol yang menyebabkan valuasi HPP melonjak hingga 45 Triliun).
-- 2. Menghapus data abnormal dan mengembalikan nilai buy_price ke rasio wajar (~80% sell_price).
-- 3. Menerapkan CHECK constraints permanen agar data abnormal tidak dapat dimasukkan lagi.
-- ==============================================================================

-- ── 1. AUDIT QUERY (Dapat dieksekusi manual oleh DBA/Developer) ────────────────
-- SELECT id, sku, name, stock, buy_price, sell_price, (stock * buy_price) AS total_hpp
-- FROM public.products
-- WHERE (stock * buy_price) > 500000000 OR buy_price > 50000000 OR stock > 100000
-- ORDER BY total_hpp DESC;

-- ── 2. PEMBERSIHAN DATA ANOMALI (DATA REPAIR & SANITIZATION) ──────────────────

-- A. Sanitasi nilai NULL dan negatif terlebih dahulu
UPDATE public.products
SET buy_price = 0
WHERE buy_price IS NULL OR buy_price < 0;

UPDATE public.products
SET sell_price = 0
WHERE sell_price IS NULL OR sell_price < 0;

UPDATE public.products
SET stock = 0
WHERE stock IS NULL OR stock < 0;

-- B. Perbaiki produk dengan buy_price ekstrim (> Rp 50.000.000)
-- Kasus umum: Barcode scanner terpindai ke kolom harga beli (misal 899xxxxxxxxx) atau pengetikan nol berlebih.
-- Solusi: Jika sell_price realistis (> 0 dan <= 50.000.000), set buy_price ke 80% dari harga jual.
-- Jika sell_price juga ekstrim, set buy_price ke 0 untuk diaudit ulang secara manual.
UPDATE public.products
SET buy_price = CASE 
    WHEN sell_price > 0 AND sell_price <= 50000000 THEN ROUND(sell_price * 0.8)
    ELSE 0
END
WHERE buy_price > 50000000;

-- C. Perbaiki produk dengan sell_price ekstrim (> Rp 50.000.000)
UPDATE public.products
SET sell_price = CASE
    WHEN buy_price > 0 AND buy_price <= 50000000 THEN ROUND(buy_price * 1.25)
    ELSE 0
END
WHERE sell_price > 50000000;

-- D. Perbaiki produk dengan stok fisik di luar nalar retail (> 100.000 unit)
UPDATE public.products
SET stock = 0
WHERE stock > 100000;

-- E. Perbaiki produk yang total valuasi HPP per item (stock * buy_price) masih > Rp 500.000.000
UPDATE public.products
SET buy_price = CASE
    WHEN sell_price > 0 AND sell_price <= 50000000 THEN ROUND(sell_price * 0.8)
    WHEN stock > 0 THEN LEAST(buy_price, ROUND(500000000 / stock))
    ELSE 0
END
WHERE (stock * buy_price) > 500000000;

-- F. Final clamping untuk memastikan seluruh data ada dalam rentang aman constraint
UPDATE public.products
SET buy_price = 100000000
WHERE buy_price > 100000000;

UPDATE public.products
SET sell_price = 100000000
WHERE sell_price > 100000000;

UPDATE public.products
SET stock = 100000
WHERE stock > 100000;

-- ── 3. TAMBAHKAN CHECK CONSTRAINTS UNTUK INTEGRITAS DATA ─────────────────────

DO $$
BEGIN
    -- Hapus constraint lama jika sudah ada agar migrasi bersifat idempotent
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS check_products_buy_price_range;
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS check_products_sell_price_range;
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS check_products_stock_range;

    -- Tambahkan batas harga beli satuan maksimum Rp 100.000.000 (100 Juta)
    ALTER TABLE public.products
        ADD CONSTRAINT check_products_buy_price_range 
        CHECK (buy_price >= 0 AND buy_price <= 100000000);

    -- Tambahkan batas harga jual satuan maksimum Rp 100.000.000 (100 Juta)
    ALTER TABLE public.products
        ADD CONSTRAINT check_products_sell_price_range 
        CHECK (sell_price >= 0 AND sell_price <= 100000000);

    -- Tambahkan batas stok fisik maksimum 100.000 unit per SKU
    ALTER TABLE public.products
        ADD CONSTRAINT check_products_stock_range 
        CHECK (stock >= 0 AND stock <= 100000);
END $$;

-- ── 4. HELPER RPC FUNCTION UNTUK AUDIT BERKALA ANOMALI HARGA & STOK ───────────

CREATE OR REPLACE FUNCTION public.audit_product_price_anomalies()
RETURNS TABLE (
    id UUID,
    sku TEXT,
    name TEXT,
    stock INTEGER,
    buy_price NUMERIC,
    sell_price NUMERIC,
    total_hpp NUMERIC,
    issue_description TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        p.id,
        p.sku,
        p.name,
        p.stock,
        p.buy_price,
        p.sell_price,
        (p.stock * p.buy_price) AS total_hpp,
        CASE 
            WHEN p.buy_price > 50000000 THEN 'Harga beli ekstrim (> 50 Juta / Barcode Scanner Error)'
            WHEN (p.stock * p.buy_price) > 500000000 THEN 'Valuasi HPP total ekstrim (> 500 Juta)'
            WHEN p.buy_price > p.sell_price AND p.sell_price > 0 THEN 'Harga beli lebih tinggi dari harga jual (Rugi Kotor)'
            WHEN p.stock > 100000 THEN 'Jumlah stok melebihi batas 100.000 unit'
            ELSE 'Normal'
        END AS issue_description
    FROM public.products p
    WHERE (p.stock * p.buy_price) > 500000000 
       OR p.buy_price > 50000000 
       OR p.sell_price > 50000000
       OR p.stock > 100000
       OR (p.buy_price > p.sell_price AND p.sell_price > 0)
    ORDER BY total_hpp DESC;
$$;

