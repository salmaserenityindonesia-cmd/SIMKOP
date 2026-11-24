-- ==============================================================================
-- Migration: 20261124_migrate_legacy_register_numbers_compact.sql
-- Deskripsi:
--   1. Memperbarui trigger public.fn_ensure_loan_receipt_number() agar fallback
--      database menghasilkan nomor kwitansi ringkas KWYYMM-XXXX (bukan KW-PINJ/...).
--   2. Menyediakan tabel audit pemetaan public.register_number_migration_map
--      agar seluruh perubahan nomor register lama -> ringkas dapat dilacak & di-rollback.
--   3. Menyediakan fungsi:
--      - public.preview_compact_register_migration()        [100% READ-ONLY Dry-Run]
--      - public.execute_compact_register_migration(dry_run) [Default p_dry_run = true]
--      - public.rollback_compact_register_migration(batch)  [Rollback penuh per batch_id]
--
-- Catatan Keamanan:
--   - Menjalankan file migrasi ini HANYA memasang fungsi, tabel mapping, dan trigger baru.
--   - Data transaksi lama TIDAK berubah sampai Anda menjalankan secara eksplisit:
--       SELECT public.execute_compact_register_migration(false);
--   - Kode khusus berikut DIKECUALIKAN (tidak pernah diubah):
--       * Kode yang sudah berformat ringkas: ^(LN|KW|KS|POS|PB|KB|RB)\d{4}-\d{4,}$
--       * Saldo awal pinjaman: SALDO-AWAL-%
--       * Pencairan massal Lebaran: KW-THR-%
--       * Pembagian SHU RAT: SHU-RAT-%
--       * Transaksi POS ditahan (parked): HOLD-%
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Perbarui Trigger Fallback Nomor Kwitansi Angsuran (KWYYMM-XXXX)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ensure_loan_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
  v_target_ts TIMESTAMPTZ;
  v_yymm TEXT;
  v_prefix TEXT;
  v_max_seq INTEGER := 0;
  v_candidate TEXT;
BEGIN
  IF NEW.receipt_number IS NULL OR TRIM(NEW.receipt_number) = '' THEN
    v_target_ts := COALESCE(NEW.payment_date, NOW());
    v_yymm := TO_CHAR(v_target_ts AT TIME ZONE 'Asia/Jakarta', 'YYMM');
    v_prefix := 'KW' || v_yymm || '-';

    SELECT COALESCE(
      MAX(
        CASE
          WHEN UPPER(TRIM(receipt_number)) ~ ('^' || v_prefix || '[0-9]+$')
          THEN SUBSTRING(UPPER(TRIM(receipt_number)) FROM LENGTH(v_prefix) + 1)::INTEGER
          ELSE 0
        END
      ),
      0
    )
    INTO v_max_seq
    FROM public.loan_repayments
    WHERE receipt_number ILIKE (v_prefix || '%');

    LOOP
      v_max_seq := v_max_seq + 1;
      v_candidate := v_prefix || LPAD(v_max_seq::TEXT, GREATEST(4, LENGTH(v_max_seq::TEXT)), '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.loan_repayments
        WHERE UPPER(TRIM(receipt_number)) = v_candidate
      );
    END LOOP;

    NEW.receipt_number := v_candidate;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.loan_repayments') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_loan_repayments_receipt ON public.loan_repayments;
    CREATE TRIGGER trg_loan_repayments_receipt
    BEFORE INSERT ON public.loan_repayments
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_ensure_loan_receipt_number();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Tabel Audit Pemetaan Migrasi (Untuk Pelacakan & Rollback Aman)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.register_number_migration_map (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  record_id UUID,
  old_code TEXT NOT NULL,
  new_code TEXT NOT NULL,
  period_yymm TEXT NOT NULL,
  affected_rows INTEGER NOT NULL DEFAULT 1,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_mig_map_batch
  ON public.register_number_migration_map (batch_id);

CREATE INDEX IF NOT EXISTS idx_reg_mig_map_entity_old
  ON public.register_number_migration_map (entity_type, old_code);

CREATE INDEX IF NOT EXISTS idx_reg_mig_map_entity_new
  ON public.register_number_migration_map (entity_type, new_code);

ALTER TABLE public.register_number_migration_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read register_number_migration_map" ON public.register_number_migration_map;
CREATE POLICY "Allow read register_number_migration_map"
  ON public.register_number_migration_map
  FOR SELECT
  TO authenticated, service_role
  USING (true);

GRANT SELECT ON TABLE public.register_number_migration_map TO authenticated;
GRANT ALL ON TABLE public.register_number_migration_map TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Fungsi Dry-Run Preview (100% Read-Only)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_compact_register_migration()
RETURNS TABLE (
  entity_type TEXT,
  period_yymm TEXT,
  old_code TEXT,
  new_code TEXT,
  affected_rows INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  DROP TABLE IF EXISTS pg_temp._tmp_preview_reg_map;
  CREATE TEMP TABLE _tmp_preview_reg_map (
    entity_type TEXT NOT NULL,
    period_yymm TEXT NOT NULL,
    old_code TEXT NOT NULL,
    new_code TEXT NOT NULL,
    affected_rows INTEGER NOT NULL
  ) ON COMMIT DROP;

  -- A. sales.sale_number -> POSYYMM-XXXX (diproses lebih dulu agar sinkron dengan deposit_transactions POS Belanja)
  IF to_regclass('public.sales') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'sale_number'
  ) THEN
    INSERT INTO _tmp_preview_reg_map (entity_type, period_yymm, old_code, new_code, affected_rows)
    WITH existing_max AS (
      SELECT
        SUBSTRING(UPPER(TRIM(sale_number)) FROM '^POS([0-9]{4})-[0-9]+$') AS yymm,
        MAX(SUBSTRING(UPPER(TRIM(sale_number)) FROM '^POS[0-9]{4}-([0-9]+)$')::INTEGER) AS max_seq
      FROM public.sales
      WHERE sale_number ~* '^POS[0-9]{4}-[0-9]+$'
      GROUP BY 1
    ),
    grouped_legacy AS (
      SELECT
        TRIM(sale_number) AS old_code,
        TO_CHAR(MIN(COALESCE((to_jsonb(s)->>'created_at')::TIMESTAMPTZ, NOW())) AT TIME ZONE 'Asia/Jakarta', 'YYMM') AS yymm,
        MIN(COALESCE((to_jsonb(s)->>'created_at')::TIMESTAMPTZ, NOW())) AS first_ts,
        COUNT(*)::INTEGER AS cnt
      FROM public.sales s
      WHERE sale_number IS NOT NULL
        AND TRIM(sale_number) <> ''
        AND sale_number !~* '^(LN|KW|KS|POS|PB|KB|RB)[0-9]{4}-[0-9]{4,}$'
        AND UPPER(TRIM(sale_number)) NOT LIKE 'HOLD-%'
      GROUP BY 1
    ),
    numbered AS (
      SELECT
        g.yymm,
        g.old_code,
        g.cnt,
        COALESCE(em.max_seq, 0) + ROW_NUMBER() OVER (PARTITION BY g.yymm ORDER BY g.first_ts ASC, g.old_code ASC) AS seq_num
      FROM grouped_legacy g
      LEFT JOIN existing_max em ON em.yymm = g.yymm
    )
    SELECT
      'sales'::TEXT,
      n.yymm,
      n.old_code,
      'POS' || n.yymm || '-' || LPAD(n.seq_num::TEXT, GREATEST(4, LENGTH(n.seq_num::TEXT)), '0'),
      n.cnt
    FROM numbered n;
  END IF;

  -- B. loans.loan_number -> LNYYMM-XXXX (mengecualikan SALDO-AWAL-%)
  IF to_regclass('public.loans') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'loan_number'
  ) THEN
    INSERT INTO _tmp_preview_reg_map (entity_type, period_yymm, old_code, new_code, affected_rows)
    WITH existing_max AS (
      SELECT
        SUBSTRING(UPPER(TRIM(loan_number)) FROM '^LN([0-9]{4})-[0-9]+$') AS yymm,
        MAX(SUBSTRING(UPPER(TRIM(loan_number)) FROM '^LN[0-9]{4}-([0-9]+)$')::INTEGER) AS max_seq
      FROM public.loans
      WHERE loan_number ~* '^LN[0-9]{4}-[0-9]+$'
      GROUP BY 1
    ),
    grouped_legacy AS (
      SELECT
        TRIM(loan_number) AS old_code,
        TO_CHAR(
          MIN(
            COALESCE(
              NULLIF(to_jsonb(l)->>'disbursed_at', '')::TIMESTAMPTZ,
              NULLIF(to_jsonb(l)->>'created_at', '')::TIMESTAMPTZ,
              NULLIF(to_jsonb(l)->>'applied_at', '')::TIMESTAMPTZ,
              NOW()
            )
          ) AT TIME ZONE 'Asia/Jakarta',
          'YYMM'
        ) AS yymm,
        MIN(
          COALESCE(
            NULLIF(to_jsonb(l)->>'disbursed_at', '')::TIMESTAMPTZ,
            NULLIF(to_jsonb(l)->>'created_at', '')::TIMESTAMPTZ,
            NULLIF(to_jsonb(l)->>'applied_at', '')::TIMESTAMPTZ,
            NOW()
          )
        ) AS first_ts,
        COUNT(*)::INTEGER AS cnt
      FROM public.loans l
      WHERE loan_number IS NOT NULL
        AND TRIM(loan_number) <> ''
        AND loan_number !~* '^(LN|KW|KS|POS|PB|KB|RB)[0-9]{4}-[0-9]{4,}$'
        AND UPPER(TRIM(loan_number)) NOT LIKE 'SALDO-AWAL-%'
      GROUP BY 1
    ),
    numbered AS (
      SELECT
        g.yymm,
        g.old_code,
        g.cnt,
        COALESCE(em.max_seq, 0) + ROW_NUMBER() OVER (PARTITION BY g.yymm ORDER BY g.first_ts ASC, g.old_code ASC) AS seq_num
      FROM grouped_legacy g
      LEFT JOIN existing_max em ON em.yymm = g.yymm
    )
    SELECT
      'loans'::TEXT,
      n.yymm,
      n.old_code,
      'LN' || n.yymm || '-' || LPAD(n.seq_num::TEXT, GREATEST(4, LENGTH(n.seq_num::TEXT)), '0'),
      n.cnt
    FROM numbered n;
  END IF;

  -- C. deposit_transactions.reference_no -> KSYYMM-XXXX
  --    Mengecualikan KW-THR-%, SHU-RAT-%, kode ringkas eksisting, serta referensi struk POS (INV-% / POS-%)
  IF to_regclass('public.deposit_transactions') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deposit_transactions' AND column_name = 'reference_no'
  ) THEN
    INSERT INTO _tmp_preview_reg_map (entity_type, period_yymm, old_code, new_code, affected_rows)
    WITH existing_max AS (
      SELECT
        SUBSTRING(UPPER(TRIM(reference_no)) FROM '^KS([0-9]{4})-[0-9]+$') AS yymm,
        MAX(SUBSTRING(UPPER(TRIM(reference_no)) FROM '^KS[0-9]{4}-([0-9]+)$')::INTEGER) AS max_seq
      FROM public.deposit_transactions
      WHERE reference_no ~* '^KS[0-9]{4}-[0-9]+$'
      GROUP BY 1
    ),
    grouped_legacy AS (
      SELECT
        TRIM(reference_no) AS old_code,
        TO_CHAR(
          MIN(
            COALESCE(
              NULLIF(to_jsonb(dt)->>'transaction_date', '')::TIMESTAMPTZ,
              NULLIF(to_jsonb(dt)->>'created_at', '')::TIMESTAMPTZ,
              NOW()
            )
          ) AT TIME ZONE 'Asia/Jakarta',
          'YYMM'
        ) AS yymm,
        MIN(
          COALESCE(
            NULLIF(to_jsonb(dt)->>'transaction_date', '')::TIMESTAMPTZ,
            NULLIF(to_jsonb(dt)->>'created_at', '')::TIMESTAMPTZ,
            NOW()
          )
        ) AS first_ts,
        COUNT(*)::INTEGER AS cnt
      FROM public.deposit_transactions dt
      WHERE reference_no IS NOT NULL
        AND TRIM(reference_no) <> ''
        AND reference_no !~* '^(LN|KW|KS|POS|PB|KB|RB)[0-9]{4}-[0-9]{4,}$'
        AND UPPER(TRIM(reference_no)) NOT LIKE 'KW-THR-%'
        AND UPPER(TRIM(reference_no)) NOT LIKE 'SHU-RAT-%'
        AND UPPER(TRIM(reference_no)) !~ '^(INV-|POS-)'
        AND NOT EXISTS (
          SELECT 1 FROM _tmp_preview_reg_map sm
          WHERE sm.entity_type = 'sales'
            AND UPPER(sm.old_code) = UPPER(TRIM(dt.reference_no))
        )
      GROUP BY 1
    ),
    numbered AS (
      SELECT
        g.yymm,
        g.old_code,
        g.cnt,
        COALESCE(em.max_seq, 0) + ROW_NUMBER() OVER (PARTITION BY g.yymm ORDER BY g.first_ts ASC, g.old_code ASC) AS seq_num
      FROM grouped_legacy g
      LEFT JOIN existing_max em ON em.yymm = g.yymm
    )
    SELECT
      'deposit_transactions'::TEXT,
      n.yymm,
      n.old_code,
      'KS' || n.yymm || '-' || LPAD(n.seq_num::TEXT, GREATEST(4, LENGTH(n.seq_num::TEXT)), '0'),
      n.cnt
    FROM numbered n;
  END IF;

  -- D. loan_repayments.receipt_number -> KWYYMM-XXXX (atau selaras KSYYMM-XXXX bila bagian batch Terima Setoran)
  IF to_regclass('public.loan_repayments') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loan_repayments' AND column_name = 'receipt_number'
  ) THEN
    INSERT INTO _tmp_preview_reg_map (entity_type, period_yymm, old_code, new_code, affected_rows)
    WITH existing_max AS (
      SELECT
        SUBSTRING(UPPER(TRIM(receipt_number)) FROM '^KW([0-9]{4})-[0-9]+$') AS yymm,
        MAX(SUBSTRING(UPPER(TRIM(receipt_number)) FROM '^KW[0-9]{4}-([0-9]+)$')::INTEGER) AS max_seq
      FROM public.loan_repayments
      WHERE receipt_number ~* '^KW[0-9]{4}-[0-9]+$'
      GROUP BY 1
    ),
    raw_distinct AS (
      SELECT
        TRIM(receipt_number) AS old_code,
        TO_CHAR(
          MIN(
            COALESCE(
              NULLIF(to_jsonb(lr)->>'payment_date', '')::TIMESTAMPTZ,
              NULLIF(to_jsonb(lr)->>'created_at', '')::TIMESTAMPTZ,
              NOW()
            )
          ) AT TIME ZONE 'Asia/Jakarta',
          'YYMM'
        ) AS yymm,
        MIN(
          COALESCE(
            NULLIF(to_jsonb(lr)->>'payment_date', '')::TIMESTAMPTZ,
            NULLIF(to_jsonb(lr)->>'created_at', '')::TIMESTAMPTZ,
            NOW()
          )
        ) AS first_ts,
        COUNT(*)::INTEGER AS cnt
      FROM public.loan_repayments lr
      WHERE receipt_number IS NOT NULL
        AND TRIM(receipt_number) <> ''
        AND receipt_number !~* '^(LN|KW|KS|POS|PB|KB|RB)[0-9]{4}-[0-9]{4,}(-[0-9]+)?$'
      GROUP BY 1
    ),
    batch_linked AS (
      SELECT DISTINCT ON (r.old_code, r.yymm)
        r.old_code,
        r.yymm,
        r.first_ts,
        r.cnt,
        CASE
          WHEN UPPER(r.old_code) = UPPER(dm.old_code) THEN dm.new_code
          ELSE dm.new_code || '-' || SUBSTRING(r.old_code FROM LENGTH(dm.old_code) + 2)
        END AS linked_new_code
      FROM raw_distinct r
      JOIN _tmp_preview_reg_map dm
        ON dm.entity_type = 'deposit_transactions'
       AND (
         UPPER(r.old_code) = UPPER(dm.old_code)
         OR (
           UPPER(r.old_code) LIKE UPPER(dm.old_code) || '-%'
           AND SUBSTRING(r.old_code FROM LENGTH(dm.old_code) + 2) ~ '^[0-9]+$'
         )
       )
      ORDER BY r.old_code, r.yymm, LENGTH(dm.old_code) DESC
    ),
    standalone_legacy AS (
      SELECT r.*
      FROM raw_distinct r
      WHERE NOT EXISTS (
        SELECT 1 FROM batch_linked b
        WHERE b.old_code = r.old_code AND b.yymm = r.yymm
      )
    ),
    numbered_standalone AS (
      SELECT
        s.yymm,
        s.old_code,
        s.cnt,
        COALESCE(em.max_seq, 0) + ROW_NUMBER() OVER (PARTITION BY s.yymm ORDER BY s.first_ts ASC, s.old_code ASC) AS seq_num
      FROM standalone_legacy s
      LEFT JOIN existing_max em ON em.yymm = s.yymm
    )
    SELECT
      'loan_repayments'::TEXT,
      b.yymm,
      b.old_code,
      b.linked_new_code,
      b.cnt
    FROM batch_linked b
    UNION ALL
    SELECT
      'loan_repayments'::TEXT,
      n.yymm,
      n.old_code,
      'KW' || n.yymm || '-' || LPAD(n.seq_num::TEXT, GREATEST(4, LENGTH(n.seq_num::TEXT)), '0'),
      n.cnt
    FROM numbered_standalone n;
  END IF;

  -- E. store_credit_payments.receipt_number -> KBYYMM-XXXX
  IF to_regclass('public.store_credit_payments') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_credit_payments' AND column_name = 'receipt_number'
  ) THEN
    INSERT INTO _tmp_preview_reg_map (entity_type, period_yymm, old_code, new_code, affected_rows)
    WITH existing_max AS (
      SELECT
        SUBSTRING(UPPER(TRIM(receipt_number)) FROM '^KB([0-9]{4})-[0-9]+$') AS yymm,
        MAX(SUBSTRING(UPPER(TRIM(receipt_number)) FROM '^KB[0-9]{4}-([0-9]+)$')::INTEGER) AS max_seq
      FROM public.store_credit_payments
      WHERE receipt_number ~* '^KB[0-9]{4}-[0-9]+$'
      GROUP BY 1
    ),
    grouped_legacy AS (
      SELECT
        TRIM(receipt_number) AS old_code,
        TO_CHAR(
          MIN(
            COALESCE(
              NULLIF(to_jsonb(scp)->>'payment_date', '')::TIMESTAMPTZ,
              NULLIF(to_jsonb(scp)->>'created_at', '')::TIMESTAMPTZ,
              NOW()
            )
          ) AT TIME ZONE 'Asia/Jakarta',
          'YYMM'
        ) AS yymm,
        MIN(
          COALESCE(
            NULLIF(to_jsonb(scp)->>'payment_date', '')::TIMESTAMPTZ,
            NULLIF(to_jsonb(scp)->>'created_at', '')::TIMESTAMPTZ,
            NOW()
          )
        ) AS first_ts,
        COUNT(*)::INTEGER AS cnt
      FROM public.store_credit_payments scp
      WHERE receipt_number IS NOT NULL
        AND TRIM(receipt_number) <> ''
        AND receipt_number !~* '^(LN|KW|KS|POS|PB|KB|RB)[0-9]{4}-[0-9]{4,}$'
      GROUP BY 1
    ),
    numbered AS (
      SELECT
        g.yymm,
        g.old_code,
        g.cnt,
        COALESCE(em.max_seq, 0) + ROW_NUMBER() OVER (PARTITION BY g.yymm ORDER BY g.first_ts ASC, g.old_code ASC) AS seq_num
      FROM grouped_legacy g
      LEFT JOIN existing_max em ON em.yymm = g.yymm
    )
    SELECT
      'store_credit_payments'::TEXT,
      n.yymm,
      n.old_code,
      'KB' || n.yymm || '-' || LPAD(n.seq_num::TEXT, GREATEST(4, LENGTH(n.seq_num::TEXT)), '0'),
      n.cnt
    FROM numbered n;
  END IF;

  -- F. purchases.invoice_number -> PBYYMM-XXXX
  IF to_regclass('public.purchases') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'invoice_number'
  ) THEN
    INSERT INTO _tmp_preview_reg_map (entity_type, period_yymm, old_code, new_code, affected_rows)
    WITH existing_max AS (
      SELECT
        SUBSTRING(UPPER(TRIM(invoice_number)) FROM '^PB([0-9]{4})-[0-9]+$') AS yymm,
        MAX(SUBSTRING(UPPER(TRIM(invoice_number)) FROM '^PB[0-9]{4}-([0-9]+)$')::INTEGER) AS max_seq
      FROM public.purchases
      WHERE invoice_number ~* '^PB[0-9]{4}-[0-9]+$'
      GROUP BY 1
    ),
    grouped_legacy AS (
      SELECT
        TRIM(invoice_number) AS old_code,
        TO_CHAR(
          MIN(
            COALESCE(
              NULLIF(to_jsonb(p)->>'purchase_date', '')::TIMESTAMPTZ,
              NULLIF(to_jsonb(p)->>'created_at', '')::TIMESTAMPTZ,
              NOW()
            )
          ) AT TIME ZONE 'Asia/Jakarta',
          'YYMM'
        ) AS yymm,
        MIN(
          COALESCE(
            NULLIF(to_jsonb(p)->>'purchase_date', '')::TIMESTAMPTZ,
            NULLIF(to_jsonb(p)->>'created_at', '')::TIMESTAMPTZ,
            NOW()
          )
        ) AS first_ts,
        COUNT(*)::INTEGER AS cnt
      FROM public.purchases p
      WHERE invoice_number IS NOT NULL
        AND TRIM(invoice_number) <> ''
        AND invoice_number !~* '^(LN|KW|KS|POS|PB|KB|RB)[0-9]{4}-[0-9]{4,}$'
      GROUP BY 1
    ),
    numbered AS (
      SELECT
        g.yymm,
        g.old_code,
        g.cnt,
        COALESCE(em.max_seq, 0) + ROW_NUMBER() OVER (PARTITION BY g.yymm ORDER BY g.first_ts ASC, g.old_code ASC) AS seq_num
      FROM grouped_legacy g
      LEFT JOIN existing_max em ON em.yymm = g.yymm
    )
    SELECT
      'purchases'::TEXT,
      n.yymm,
      n.old_code,
      'PB' || n.yymm || '-' || LPAD(n.seq_num::TEXT, GREATEST(4, LENGTH(n.seq_num::TEXT)), '0'),
      n.cnt
    FROM numbered n;
  END IF;

  -- G. purchase_returns.return_number -> RBYYMM-XXXX
  IF to_regclass('public.purchase_returns') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'return_number'
  ) THEN
    INSERT INTO _tmp_preview_reg_map (entity_type, period_yymm, old_code, new_code, affected_rows)
    WITH existing_max AS (
      SELECT
        SUBSTRING(UPPER(TRIM(return_number)) FROM '^RB([0-9]{4})-[0-9]+$') AS yymm,
        MAX(SUBSTRING(UPPER(TRIM(return_number)) FROM '^RB[0-9]{4}-([0-9]+)$')::INTEGER) AS max_seq
      FROM public.purchase_returns
      WHERE return_number ~* '^RB[0-9]{4}-[0-9]+$'
      GROUP BY 1
    ),
    grouped_legacy AS (
      SELECT
        TRIM(return_number) AS old_code,
        TO_CHAR(
          MIN(
            COALESCE(
              NULLIF(to_jsonb(pr)->>'return_date', '')::TIMESTAMPTZ,
              NULLIF(to_jsonb(pr)->>'created_at', '')::TIMESTAMPTZ,
              NOW()
            )
          ) AT TIME ZONE 'Asia/Jakarta',
          'YYMM'
        ) AS yymm,
        MIN(
          COALESCE(
            NULLIF(to_jsonb(pr)->>'return_date', '')::TIMESTAMPTZ,
            NULLIF(to_jsonb(pr)->>'created_at', '')::TIMESTAMPTZ,
            NOW()
          )
        ) AS first_ts,
        COUNT(*)::INTEGER AS cnt
      FROM public.purchase_returns pr
      WHERE return_number IS NOT NULL
        AND TRIM(return_number) <> ''
        AND return_number !~* '^(LN|KW|KS|POS|PB|KB|RB)[0-9]{4}-[0-9]{4,}$'
      GROUP BY 1
    ),
    numbered AS (
      SELECT
        g.yymm,
        g.old_code,
        g.cnt,
        COALESCE(em.max_seq, 0) + ROW_NUMBER() OVER (PARTITION BY g.yymm ORDER BY g.first_ts ASC, g.old_code ASC) AS seq_num
      FROM grouped_legacy g
      LEFT JOIN existing_max em ON em.yymm = g.yymm
    )
    SELECT
      'purchase_returns'::TEXT,
      n.yymm,
      n.old_code,
      'RB' || n.yymm || '-' || LPAD(n.seq_num::TEXT, GREATEST(4, LENGTH(n.seq_num::TEXT)), '0'),
      n.cnt
    FROM numbered n;
  END IF;

  RETURN QUERY
  SELECT m.entity_type, m.period_yymm, m.old_code, m.new_code, m.affected_rows
  FROM _tmp_preview_reg_map m
  ORDER BY m.entity_type, m.period_yymm, m.new_code;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Fungsi Eksekutor Atomik + Sinkronisasi Lintas Tabel (Default: Dry-Run = true)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_compact_register_migration(
  p_dry_run BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch_id UUID := gen_random_uuid();
  v_total_codes INTEGER := 0;
  v_counts_by_entity JSONB := '{}'::JSONB;
  v_sample_mappings JSONB := '[]'::JSONB;
  v_cf_ref_type TEXT := NULL;

  v_cnt_dep_ref_pos INTEGER := 0;
  v_cnt_dep_text INTEGER := 0;
  v_cnt_sc_sched INTEGER := 0;
  v_cnt_scp_notes INTEGER := 0;
  v_cnt_loans_notes INTEGER := 0;
  v_cnt_repay_notes INTEGER := 0;
  v_cnt_ret_orig_inv INTEGER := 0;
  v_cnt_cf_desc INTEGER := 0;
  v_cnt_cf_ref_id INTEGER := 0;
  v_row_cnt INTEGER := 0;

  r_map RECORD;
BEGIN
  DROP TABLE IF EXISTS pg_temp._tmp_compact_map;
  CREATE TEMP TABLE _tmp_compact_map (
    entity_type TEXT NOT NULL,
    period_yymm TEXT NOT NULL,
    old_code TEXT NOT NULL,
    new_code TEXT NOT NULL,
    affected_rows INTEGER NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _tmp_compact_map (entity_type, period_yymm, old_code, new_code, affected_rows)
  SELECT p.entity_type, p.period_yymm, p.old_code, p.new_code, p.affected_rows
  FROM public.preview_compact_register_migration() p;

  SELECT COUNT(*)::INTEGER INTO v_total_codes FROM _tmp_compact_map;

  SELECT COALESCE(
    jsonb_object_agg(sub.entity_type, jsonb_build_object('distinct_codes', sub.code_count, 'primary_rows', sub.row_sum)),
    '{}'::JSONB
  )
  INTO v_counts_by_entity
  FROM (
    SELECT entity_type, COUNT(*)::INTEGER AS code_count, SUM(affected_rows)::INTEGER AS row_sum
    FROM _tmp_compact_map
    GROUP BY entity_type
  ) sub;

  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::JSONB)
  INTO v_sample_mappings
  FROM (
    SELECT entity_type, period_yymm, old_code, new_code, affected_rows
    FROM _tmp_compact_map
    ORDER BY entity_type, period_yymm, new_code
    LIMIT 25
  ) s;

  IF to_regclass('public.cash_flow') IS NOT NULL THEN
    SELECT data_type INTO v_cf_ref_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_flow' AND column_name = 'reference_id';
  END IF;

  -- Mode Dry-Run: hitung dampak lintas tabel tanpa mengubah satu baris pun
  IF COALESCE(p_dry_run, true) THEN
    IF to_regclass('public.deposit_transactions') IS NOT NULL THEN
      SELECT COUNT(*)::INTEGER INTO v_cnt_dep_ref_pos
      FROM public.deposit_transactions dt
      JOIN _tmp_compact_map m
        ON m.entity_type = 'sales'
       AND TRIM(dt.reference_no) = m.old_code;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'deposit_transactions' AND column_name = 'description'
      ) THEN
        SELECT COUNT(*)::INTEGER INTO v_cnt_dep_text
        FROM public.deposit_transactions dt
        WHERE EXISTS (
          SELECT 1 FROM _tmp_compact_map m
          WHERE m.entity_type IN ('sales', 'deposit_transactions')
            AND (
              (dt.description IS NOT NULL AND STRPOS(dt.description, m.old_code) > 0)
              OR (to_jsonb(dt)->>'notes' IS NOT NULL AND STRPOS(to_jsonb(dt)->>'notes', m.old_code) > 0)
            )
        );
      END IF;
    END IF;

    IF to_regclass('public.store_credit_schedules') IS NOT NULL AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_credit_schedules' AND column_name = 'receipt_number'
    ) THEN
      SELECT COUNT(*)::INTEGER INTO v_cnt_sc_sched
      FROM public.store_credit_schedules scs
      JOIN _tmp_compact_map m
        ON m.entity_type = 'store_credit_payments'
       AND TRIM(scs.receipt_number) = m.old_code;
    END IF;

    IF to_regclass('public.store_credit_payments') IS NOT NULL AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_credit_payments' AND column_name = 'notes'
    ) THEN
      SELECT COUNT(*)::INTEGER INTO v_cnt_scp_notes
      FROM public.store_credit_payments scp
      WHERE scp.notes IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM _tmp_compact_map m
          WHERE m.entity_type = 'sales' AND STRPOS(scp.notes, m.old_code) > 0
        );
    END IF;

    IF to_regclass('public.loans') IS NOT NULL AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'notes'
    ) THEN
      SELECT COUNT(*)::INTEGER INTO v_cnt_loans_notes
      FROM public.loans l
      WHERE l.notes IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM _tmp_compact_map m
          WHERE m.entity_type = 'loans' AND STRPOS(l.notes, m.old_code) > 0
        );
    END IF;

    IF to_regclass('public.loan_repayments') IS NOT NULL AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'loan_repayments' AND column_name = 'notes'
    ) THEN
      SELECT COUNT(*)::INTEGER INTO v_cnt_repay_notes
      FROM public.loan_repayments lr
      WHERE lr.notes IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM _tmp_compact_map m
          WHERE m.entity_type = 'loans' AND STRPOS(lr.notes, m.old_code) > 0
        );
    END IF;

    IF to_regclass('public.purchase_returns') IS NOT NULL AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'original_invoice_number'
    ) THEN
      SELECT COUNT(*)::INTEGER INTO v_cnt_ret_orig_inv
      FROM public.purchase_returns pr
      JOIN _tmp_compact_map m
        ON m.entity_type = 'purchases'
       AND TRIM(pr.original_invoice_number) = m.old_code;
    END IF;

    IF to_regclass('public.cash_flow') IS NOT NULL AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cash_flow' AND column_name = 'description'
    ) THEN
      SELECT COUNT(*)::INTEGER INTO v_cnt_cf_desc
      FROM public.cash_flow cf
      WHERE cf.description IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM _tmp_compact_map m
          WHERE STRPOS(cf.description, m.old_code) > 0
        );
    END IF;

    IF v_cf_ref_type IN ('text', 'character varying') THEN
      SELECT COUNT(*)::INTEGER INTO v_cnt_cf_ref_id
      FROM public.cash_flow cf
      JOIN _tmp_compact_map m ON TRIM(cf.reference_id) = m.old_code;
    END IF;

    RETURN jsonb_build_object(
      'dry_run', true,
      'total_codes_to_migrate', v_total_codes,
      'counts_by_entity', v_counts_by_entity,
      'cross_table_preview', jsonb_build_object(
        'deposit_transactions_pos_reference_no', v_cnt_dep_ref_pos,
        'deposit_transactions_description_or_notes', v_cnt_dep_text,
        'store_credit_schedules_receipt_number', v_cnt_sc_sched,
        'store_credit_payments_notes', v_cnt_scp_notes,
        'loans_notes', v_cnt_loans_notes,
        'loan_repayments_notes', v_cnt_repay_notes,
        'purchase_returns_original_invoice_number', v_cnt_ret_orig_inv,
        'cash_flow_description', v_cnt_cf_desc,
        'cash_flow_reference_id', v_cnt_cf_ref_id,
        'cash_flow_reference_id_type', COALESCE(v_cf_ref_type, 'none')
      ),
      'sample_mappings', v_sample_mappings
    );
  END IF;

  -- Jika tidak ada data lama untuk dimigrasi, kembalikan langsung tanpa membuat batch kosong
  IF v_total_codes = 0 THEN
    RETURN jsonb_build_object(
      'dry_run', false,
      'batch_id', NULL,
      'total_codes_migrated', 0,
      'counts_by_entity', '{}'::JSONB,
      'cross_table_updates', '{}'::JSONB,
      'message', 'Seluruh nomor register sudah menggunakan format ringkas atau tidak ada data lama yang perlu dimigrasi.'
    );
  END IF;

  -- 1. Simpan log pemetaan permanen untuk audit & rollback
  INSERT INTO public.register_number_migration_map (
    batch_id, entity_type, record_id, old_code, new_code, period_yymm, affected_rows
  )
  SELECT
    v_batch_id,
    m.entity_type,
    CASE
      WHEN m.affected_rows <> 1 THEN NULL
      WHEN m.entity_type = 'sales' THEN (SELECT id FROM public.sales WHERE TRIM(sale_number) = m.old_code LIMIT 1)
      WHEN m.entity_type = 'loans' THEN (SELECT id FROM public.loans WHERE TRIM(loan_number) = m.old_code LIMIT 1)
      WHEN m.entity_type = 'deposit_transactions' THEN (SELECT id FROM public.deposit_transactions WHERE TRIM(reference_no) = m.old_code LIMIT 1)
      WHEN m.entity_type = 'loan_repayments' THEN (SELECT id FROM public.loan_repayments WHERE TRIM(receipt_number) = m.old_code LIMIT 1)
      WHEN m.entity_type = 'store_credit_payments' THEN (SELECT id FROM public.store_credit_payments WHERE TRIM(receipt_number) = m.old_code LIMIT 1)
      WHEN m.entity_type = 'purchases' THEN (SELECT id FROM public.purchases WHERE TRIM(invoice_number) = m.old_code LIMIT 1)
      WHEN m.entity_type = 'purchase_returns' THEN (SELECT id FROM public.purchase_returns WHERE TRIM(return_number) = m.old_code LIMIT 1)
      ELSE NULL
    END,
    m.old_code,
    m.new_code,
    m.period_yymm,
    m.affected_rows
  FROM _tmp_compact_map m;

  -- 2. Update 7 tabel utama
  IF to_regclass('public.sales') IS NOT NULL THEN
    UPDATE public.sales s
    SET sale_number = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'sales'
      AND TRIM(s.sale_number) = m.old_code;
  END IF;

  IF to_regclass('public.loans') IS NOT NULL THEN
    UPDATE public.loans l
    SET loan_number = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'loans'
      AND TRIM(l.loan_number) = m.old_code;
  END IF;

  IF to_regclass('public.deposit_transactions') IS NOT NULL THEN
    UPDATE public.deposit_transactions dt
    SET reference_no = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'deposit_transactions'
      AND TRIM(dt.reference_no) = m.old_code;
  END IF;

  IF to_regclass('public.loan_repayments') IS NOT NULL THEN
    UPDATE public.loan_repayments lr
    SET receipt_number = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'loan_repayments'
      AND TRIM(lr.receipt_number) = m.old_code;
  END IF;

  IF to_regclass('public.store_credit_payments') IS NOT NULL THEN
    UPDATE public.store_credit_payments scp
    SET receipt_number = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'store_credit_payments'
      AND TRIM(scp.receipt_number) = m.old_code;
  END IF;

  IF to_regclass('public.purchases') IS NOT NULL THEN
    UPDATE public.purchases p
    SET invoice_number = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'purchases'
      AND TRIM(p.invoice_number) = m.old_code;
  END IF;

  IF to_regclass('public.purchase_returns') IS NOT NULL THEN
    UPDATE public.purchase_returns pr
    SET return_number = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'purchase_returns'
      AND TRIM(pr.return_number) = m.old_code;
  END IF;

  -- 3. Sinkronisasi referensi lintas tabel (urut panjang old_code DESC untuk mencegah partial-substring collision)
  -- 3a. deposit_transactions.reference_no untuk transaksi Belanja POS (INV-... -> POSYYMM-XXXX)
  IF to_regclass('public.deposit_transactions') IS NOT NULL THEN
    UPDATE public.deposit_transactions dt
    SET reference_no = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'sales'
      AND TRIM(dt.reference_no) = m.old_code;
    GET DIAGNOSTICS v_cnt_dep_ref_pos = ROW_COUNT;

    -- 3b. deposit_transactions.description & notes
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deposit_transactions' AND column_name = 'description'
    ) THEN
      FOR r_map IN
        SELECT old_code, new_code
        FROM _tmp_compact_map
        WHERE entity_type IN ('sales', 'deposit_transactions')
        ORDER BY LENGTH(old_code) DESC, old_code ASC
      LOOP
        UPDATE public.deposit_transactions
        SET description = REPLACE(description, r_map.old_code, r_map.new_code)
        WHERE description IS NOT NULL
          AND STRPOS(description, r_map.old_code) > 0;
        GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
        v_cnt_dep_text := v_cnt_dep_text + v_row_cnt;
      END LOOP;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deposit_transactions' AND column_name = 'notes'
    ) THEN
      FOR r_map IN
        SELECT old_code, new_code
        FROM _tmp_compact_map
        WHERE entity_type IN ('sales', 'deposit_transactions')
        ORDER BY LENGTH(old_code) DESC, old_code ASC
      LOOP
        UPDATE public.deposit_transactions
        SET notes = REPLACE(notes, r_map.old_code, r_map.new_code)
        WHERE notes IS NOT NULL
          AND STRPOS(notes, r_map.old_code) > 0;
        GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
        v_cnt_dep_text := v_cnt_dep_text + v_row_cnt;
      END LOOP;
    END IF;
  END IF;

  -- 3c. store_credit_schedules.receipt_number
  IF to_regclass('public.store_credit_schedules') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_credit_schedules' AND column_name = 'receipt_number'
  ) THEN
    UPDATE public.store_credit_schedules scs
    SET receipt_number = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'store_credit_payments'
      AND TRIM(scs.receipt_number) = m.old_code;
    GET DIAGNOSTICS v_cnt_sc_sched = ROW_COUNT;
  END IF;

  -- 3d. store_credit_payments.notes (Ref: INV-... -> Ref: POSYYMM-XXXX)
  IF to_regclass('public.store_credit_payments') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_credit_payments' AND column_name = 'notes'
  ) THEN
    FOR r_map IN
      SELECT old_code, new_code
      FROM _tmp_compact_map
      WHERE entity_type = 'sales'
      ORDER BY LENGTH(old_code) DESC, old_code ASC
    LOOP
      UPDATE public.store_credit_payments
      SET notes = REPLACE(notes, r_map.old_code, r_map.new_code)
      WHERE notes IS NOT NULL
        AND STRPOS(notes, r_map.old_code) > 0;
      GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
      v_cnt_scp_notes := v_cnt_scp_notes + v_row_cnt;
    END LOOP;
  END IF;

  -- 3e. loans.notes (catatan kompensasi top-up yang mereferensikan LOAN-...)
  IF to_regclass('public.loans') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'notes'
  ) THEN
    FOR r_map IN
      SELECT old_code, new_code
      FROM _tmp_compact_map
      WHERE entity_type = 'loans'
      ORDER BY LENGTH(old_code) DESC, old_code ASC
    LOOP
      UPDATE public.loans
      SET notes = REPLACE(notes, r_map.old_code, r_map.new_code)
      WHERE notes IS NOT NULL
        AND STRPOS(notes, r_map.old_code) > 0;
      GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
      v_cnt_loans_notes := v_cnt_loans_notes + v_row_cnt;
    END LOOP;
  END IF;

  -- 3f. loan_repayments.notes (catatan pelunasan top-up yang menyebut nomor kontrak baru)
  IF to_regclass('public.loan_repayments') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loan_repayments' AND column_name = 'notes'
  ) THEN
    FOR r_map IN
      SELECT old_code, new_code
      FROM _tmp_compact_map
      WHERE entity_type = 'loans'
      ORDER BY LENGTH(old_code) DESC, old_code ASC
    LOOP
      UPDATE public.loan_repayments
      SET notes = REPLACE(notes, r_map.old_code, r_map.new_code)
      WHERE notes IS NOT NULL
        AND STRPOS(notes, r_map.old_code) > 0;
      GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
      v_cnt_repay_notes := v_cnt_repay_notes + v_row_cnt;
    END LOOP;
  END IF;

  -- 3g. purchase_returns.original_invoice_number
  IF to_regclass('public.purchase_returns') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'original_invoice_number'
  ) THEN
    UPDATE public.purchase_returns pr
    SET original_invoice_number = m.new_code
    FROM _tmp_compact_map m
    WHERE m.entity_type = 'purchases'
      AND TRIM(pr.original_invoice_number) = m.old_code;
    GET DIAGNOSTICS v_cnt_ret_orig_inv = ROW_COUNT;
  END IF;

  -- 3h. cash_flow.description (seluruh kode dokumen yang muncul di deskripsi mutasi kas)
  IF to_regclass('public.cash_flow') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_flow' AND column_name = 'description'
  ) THEN
    FOR r_map IN
      SELECT old_code, new_code
      FROM _tmp_compact_map
      ORDER BY LENGTH(old_code) DESC, old_code ASC
    LOOP
      UPDATE public.cash_flow
      SET description = REPLACE(description, r_map.old_code, r_map.new_code)
      WHERE description IS NOT NULL
        AND STRPOS(description, r_map.old_code) > 0;
      GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
      v_cnt_cf_desc := v_cnt_cf_desc + v_row_cnt;
    END LOOP;
  END IF;

  -- 3i. cash_flow.reference_id (HANYA jika bertipe text/varchar agar aman terhadap skema UUID)
  IF v_cf_ref_type IN ('text', 'character varying') THEN
    EXECUTE $sql$
      UPDATE public.cash_flow cf
      SET reference_id = m.new_code
      FROM _tmp_compact_map m
      WHERE TRIM(cf.reference_id) = m.old_code
    $sql$;
    GET DIAGNOSTICS v_cnt_cf_ref_id = ROW_COUNT;
  END IF;

  -- 4. Catat riwayat migrasi ke audit_logs jika tabel tersedia
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.audit_logs (
        table_name, action, record_id, entity_name, new_data, notes
      ) VALUES (
        'register_number_migration_map',
        'MIGRATE_COMPACT_REGISTERS',
        v_batch_id::TEXT,
        'register_number_migration_map',
        jsonb_build_object(
          'batch_id', v_batch_id,
          'total_codes_migrated', v_total_codes,
          'counts_by_entity', v_counts_by_entity
        ),
        'Migrasi nomor register lama ke format ringkas 11-12 karakter (batch ' || v_batch_id::TEXT || ')'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Non-blocking apabila struktur constraint audit_logs berbeda
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', false,
    'batch_id', v_batch_id,
    'total_codes_migrated', v_total_codes,
    'counts_by_entity', v_counts_by_entity,
    'cross_table_updates', jsonb_build_object(
      'deposit_transactions_pos_reference_no', v_cnt_dep_ref_pos,
      'deposit_transactions_description_or_notes', v_cnt_dep_text,
      'store_credit_schedules_receipt_number', v_cnt_sc_sched,
      'store_credit_payments_notes', v_cnt_scp_notes,
      'loans_notes', v_cnt_loans_notes,
      'loan_repayments_notes', v_cnt_repay_notes,
      'purchase_returns_original_invoice_number', v_cnt_ret_orig_inv,
      'cash_flow_description', v_cnt_cf_desc,
      'cash_flow_reference_id', v_cnt_cf_ref_id
    )
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Fungsi Rollback Darurat Per Batch
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_compact_register_migration(
  p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_map_count INTEGER := 0;
  v_cf_ref_type TEXT := NULL;
  v_cnt_restored_primary INTEGER := 0;
  v_cnt_restored_cross INTEGER := 0;
  v_row_cnt INTEGER := 0;
  r_map RECORD;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'p_batch_id wajib diisi untuk menjalankan rollback migrasi.';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_map_count
  FROM public.register_number_migration_map
  WHERE batch_id = p_batch_id;

  IF v_map_count = 0 THEN
    RAISE EXCEPTION 'Batch migrasi % tidak ditemukan di public.register_number_migration_map.', p_batch_id;
  END IF;

  -- 1. Kembalikan kode di 7 tabel utama (new_code -> old_code)
  IF to_regclass('public.sales') IS NOT NULL THEN
    UPDATE public.sales s
    SET sale_number = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'sales'
      AND TRIM(s.sale_number) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_primary := v_cnt_restored_primary + v_row_cnt;
  END IF;

  IF to_regclass('public.loans') IS NOT NULL THEN
    UPDATE public.loans l
    SET loan_number = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'loans'
      AND TRIM(l.loan_number) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_primary := v_cnt_restored_primary + v_row_cnt;
  END IF;

  IF to_regclass('public.deposit_transactions') IS NOT NULL THEN
    UPDATE public.deposit_transactions dt
    SET reference_no = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'deposit_transactions'
      AND TRIM(dt.reference_no) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_primary := v_cnt_restored_primary + v_row_cnt;
  END IF;

  IF to_regclass('public.loan_repayments') IS NOT NULL THEN
    UPDATE public.loan_repayments lr
    SET receipt_number = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'loan_repayments'
      AND TRIM(lr.receipt_number) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_primary := v_cnt_restored_primary + v_row_cnt;
  END IF;

  IF to_regclass('public.store_credit_payments') IS NOT NULL THEN
    UPDATE public.store_credit_payments scp
    SET receipt_number = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'store_credit_payments'
      AND TRIM(scp.receipt_number) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_primary := v_cnt_restored_primary + v_row_cnt;
  END IF;

  IF to_regclass('public.purchases') IS NOT NULL THEN
    UPDATE public.purchases p
    SET invoice_number = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'purchases'
      AND TRIM(p.invoice_number) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_primary := v_cnt_restored_primary + v_row_cnt;
  END IF;

  IF to_regclass('public.purchase_returns') IS NOT NULL THEN
    UPDATE public.purchase_returns pr
    SET return_number = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'purchase_returns'
      AND TRIM(pr.return_number) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_primary := v_cnt_restored_primary + v_row_cnt;
  END IF;

  -- 2. Kembalikan seluruh referensi lintas tabel (urut panjang new_code DESC)
  IF to_regclass('public.deposit_transactions') IS NOT NULL THEN
    UPDATE public.deposit_transactions dt
    SET reference_no = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'sales'
      AND TRIM(dt.reference_no) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deposit_transactions' AND column_name = 'description'
    ) THEN
      FOR r_map IN
        SELECT old_code, new_code
        FROM public.register_number_migration_map
        WHERE batch_id = p_batch_id AND entity_type IN ('sales', 'deposit_transactions')
        ORDER BY LENGTH(new_code) DESC, new_code ASC
      LOOP
        UPDATE public.deposit_transactions
        SET description = REPLACE(description, r_map.new_code, r_map.old_code)
        WHERE description IS NOT NULL AND STRPOS(description, r_map.new_code) > 0;
        GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
        v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;
      END LOOP;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deposit_transactions' AND column_name = 'notes'
    ) THEN
      FOR r_map IN
        SELECT old_code, new_code
        FROM public.register_number_migration_map
        WHERE batch_id = p_batch_id AND entity_type IN ('sales', 'deposit_transactions')
        ORDER BY LENGTH(new_code) DESC, new_code ASC
      LOOP
        UPDATE public.deposit_transactions
        SET notes = REPLACE(notes, r_map.new_code, r_map.old_code)
        WHERE notes IS NOT NULL AND STRPOS(notes, r_map.new_code) > 0;
        GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
        v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;
      END LOOP;
    END IF;
  END IF;

  IF to_regclass('public.store_credit_schedules') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_credit_schedules' AND column_name = 'receipt_number'
  ) THEN
    UPDATE public.store_credit_schedules scs
    SET receipt_number = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'store_credit_payments'
      AND TRIM(scs.receipt_number) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;
  END IF;

  IF to_regclass('public.store_credit_payments') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_credit_payments' AND column_name = 'notes'
  ) THEN
    FOR r_map IN
      SELECT old_code, new_code
      FROM public.register_number_migration_map
      WHERE batch_id = p_batch_id AND entity_type = 'sales'
      ORDER BY LENGTH(new_code) DESC, new_code ASC
    LOOP
      UPDATE public.store_credit_payments
      SET notes = REPLACE(notes, r_map.new_code, r_map.old_code)
      WHERE notes IS NOT NULL AND STRPOS(notes, r_map.new_code) > 0;
      GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
      v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;
    END LOOP;
  END IF;

  IF to_regclass('public.loans') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'notes'
  ) THEN
    FOR r_map IN
      SELECT old_code, new_code
      FROM public.register_number_migration_map
      WHERE batch_id = p_batch_id AND entity_type = 'loans'
      ORDER BY LENGTH(new_code) DESC, new_code ASC
    LOOP
      UPDATE public.loans
      SET notes = REPLACE(notes, r_map.new_code, r_map.old_code)
      WHERE notes IS NOT NULL AND STRPOS(notes, r_map.new_code) > 0;
      GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
      v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;
    END LOOP;
  END IF;

  IF to_regclass('public.loan_repayments') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loan_repayments' AND column_name = 'notes'
  ) THEN
    FOR r_map IN
      SELECT old_code, new_code
      FROM public.register_number_migration_map
      WHERE batch_id = p_batch_id AND entity_type = 'loans'
      ORDER BY LENGTH(new_code) DESC, new_code ASC
    LOOP
      UPDATE public.loan_repayments
      SET notes = REPLACE(notes, r_map.new_code, r_map.old_code)
      WHERE notes IS NOT NULL AND STRPOS(notes, r_map.new_code) > 0;
      GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
      v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;
    END LOOP;
  END IF;

  IF to_regclass('public.purchase_returns') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'original_invoice_number'
  ) THEN
    UPDATE public.purchase_returns pr
    SET original_invoice_number = m.old_code
    FROM public.register_number_migration_map m
    WHERE m.batch_id = p_batch_id
      AND m.entity_type = 'purchases'
      AND TRIM(pr.original_invoice_number) = m.new_code;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;
  END IF;

  IF to_regclass('public.cash_flow') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_flow' AND column_name = 'description'
  ) THEN
    FOR r_map IN
      SELECT old_code, new_code
      FROM public.register_number_migration_map
      WHERE batch_id = p_batch_id
      ORDER BY LENGTH(new_code) DESC, new_code ASC
    LOOP
      UPDATE public.cash_flow
      SET description = REPLACE(description, r_map.new_code, r_map.old_code)
      WHERE description IS NOT NULL AND STRPOS(description, r_map.new_code) > 0;
      GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
      v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;
    END LOOP;
  END IF;

  IF to_regclass('public.cash_flow') IS NOT NULL THEN
    SELECT data_type INTO v_cf_ref_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_flow' AND column_name = 'reference_id';
  END IF;

  IF v_cf_ref_type IN ('text', 'character varying') THEN
    EXECUTE $sql$
      UPDATE public.cash_flow cf
      SET reference_id = m.old_code
      FROM public.register_number_migration_map m
      WHERE m.batch_id = $1
        AND TRIM(cf.reference_id) = m.new_code
    $sql$ USING p_batch_id;
    GET DIAGNOSTICS v_row_cnt = ROW_COUNT;
    v_cnt_restored_cross := v_cnt_restored_cross + v_row_cnt;
  END IF;

  -- 3. Hapus baris batch yang sudah di-rollback dari tabel pemetaan
  DELETE FROM public.register_number_migration_map
  WHERE batch_id = p_batch_id;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.audit_logs (
        table_name, action, record_id, entity_name, new_data, notes
      ) VALUES (
        'register_number_migration_map',
        'ROLLBACK_COMPACT_REGISTERS',
        p_batch_id::TEXT,
        'register_number_migration_map',
        jsonb_build_object(
          'batch_id', p_batch_id,
          'restored_codes', v_map_count,
          'restored_primary_rows', v_cnt_restored_primary,
          'restored_cross_updates', v_cnt_restored_cross
        ),
        'Rollback migrasi nomor register ringkas (batch ' || p_batch_id::TEXT || ')'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'rolled_back', true,
    'batch_id', p_batch_id,
    'restored_codes', v_map_count,
    'restored_primary_rows', v_cnt_restored_primary,
    'restored_cross_updates', v_cnt_restored_cross
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_compact_register_migration() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_compact_register_migration(BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_compact_register_migration(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- PANDUAN EKSEKUSI AMAN DI SUPABASE SQL EDITOR (RUNBOOK)
-- ==============================================================================
--
-- LANGKAH 1: DRY-RUN (100% READ-ONLY — Tidak mengubah data apa pun)
--   -- Ringkasan jumlah kode & estimasi baris lintas tabel yang akan diperbarui:
--   SELECT public.execute_compact_register_migration(true);
--
--   -- Lihat daftar lengkap pemetaan kode lama -> kode ringkas baru:
--   SELECT * FROM public.preview_compact_register_migration();
--
-- LANGKAH 2: BACKUP & EKSEKUSI AKTUAL (ATOMIK)
--   -- Pastikan Anda telah membuat backup/snapshot database di Supabase Dashboard.
--   -- Jalankan perintah di bawah & SIMPAN nilai `batch_id` dari hasil JSON:
--   SELECT public.execute_compact_register_migration(false);
--
-- LANGKAH 3: VERIFIKASI PASCA-MIGRASI
--   -- Periksa tabel audit pemetaan:
--   SELECT entity_type, COUNT(*) AS jumlah_kode, MIN(new_code), MAX(new_code)
--   FROM public.register_number_migration_map
--   GROUP BY entity_type
--   ORDER BY entity_type;
--
--   -- Pastikan tidak ada kode ringkas duplikat di tabel utama:
--   SELECT loan_number, COUNT(*) FROM public.loans GROUP BY loan_number HAVING COUNT(*) > 1;
--   SELECT sale_number, COUNT(*) FROM public.sales GROUP BY sale_number HAVING COUNT(*) > 1;
--   SELECT invoice_number, COUNT(*) FROM public.purchases GROUP BY invoice_number HAVING COUNT(*) > 1;
--   SELECT return_number, COUNT(*) FROM public.purchase_returns GROUP BY return_number HAVING COUNT(*) > 1;
--
-- LANGKAH 4: ROLLBACK DARURAT (Bila diperlukan, gunakan batch_id dari Langkah 2)
--   -- SELECT public.rollback_compact_register_migration('PASTE-BATCH-UUID-DI-SINI'::UUID);
-- ==============================================================================
