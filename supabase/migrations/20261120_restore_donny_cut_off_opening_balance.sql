-- Migration: 20261120_restore_donny_cut_off_opening_balance.sql
-- Description: Membersihkan mutasi penyeimbang/pengurang anomali (bila ada) akibat bug toggle checkbox
--              dan memulihkan mutasi Saldo Awal Cut-Off (Per 1 Mar 2026 / s/d Feb 2026) untuk
--              anggota DONNY ILHAM PAMBUDI (NRP 00060019) secara idempoten.

DO $$
DECLARE
    v_donny_id UUID;
    v_md_id UUID;
    v_dt_id UUID;
    v_anomalous_tx_ids UUID[];
    v_rec RECORD;
BEGIN
    -- 1. Identifikasi member_id milik DONNY ILHAM PAMBUDI (NRP 00060019)
    SELECT id INTO v_donny_id
    FROM public.anggota
    WHERE nrp = '00060019'
    LIMIT 1;

    IF v_donny_id IS NULL THEN
        RAISE NOTICE 'Anggota dengan NRP 00060019 tidak ditemukan, migrasi dilewati.';
        RETURN;
    END IF;

    -- 2. Hapus mutasi pengurang/penyeimbang anomali akibat bug checkbox (selain pencairan Lebaran & setoran rutin sah)
    SELECT ARRAY_AGG(dt.id) INTO v_anomalous_tx_ids
    FROM public.deposit_transactions dt
    JOIN public.member_deposits md ON md.id = dt.member_deposit_id
    WHERE md.member_id = v_donny_id
      AND (
          dt.amount < 0
          OR COALESCE(dt.description, '') ILIKE '%penyeimbang%'
          OR COALESCE(dt.description, '') ILIKE '%offset%'
      )
      AND COALESCE(dt.description, '') NOT ILIKE '%Pencairan Massal Simpanan Lebaran%';

    IF v_anomalous_tx_ids IS NOT NULL AND ARRAY_LENGTH(v_anomalous_tx_ids, 1) > 0 THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'cash_flow'
        ) THEN
            DELETE FROM public.cash_flow
            WHERE reference_id = ANY(v_anomalous_tx_ids);
        END IF;

        DELETE FROM public.deposit_transactions
        WHERE id = ANY(v_anomalous_tx_ids);
    END IF;

    -- 3. Pulihkan mutasi Saldo Awal Cut-Off (s/d Feb 2026) per jenis simpanan secara idempoten
    FOR v_rec IN
        SELECT * FROM (
            VALUES
                ('POKOK',   10000::NUMERIC),
                ('WAJIB',   3200000::NUMERIC),
                ('BELANJA', 800000::NUMERIC),
                ('LEBARAN', 2400000::NUMERIC)
        ) AS t(type_code, opening_amount)
    LOOP
        SELECT id INTO v_dt_id
        FROM public.deposit_types
        WHERE UPPER(code) = v_rec.type_code
        LIMIT 1;

        IF v_dt_id IS NULL THEN
            RAISE NOTICE 'Tipe simpanan % tidak ditemukan, dilewati.', v_rec.type_code;
            CONTINUE;
        END IF;

        SELECT id INTO v_md_id
        FROM public.member_deposits
        WHERE member_id = v_donny_id
          AND deposit_type_id = v_dt_id
        LIMIT 1;

        IF v_md_id IS NULL THEN
            INSERT INTO public.member_deposits (member_id, deposit_type_id, is_terminated)
            VALUES (v_donny_id, v_dt_id, FALSE)
            RETURNING id INTO v_md_id;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.deposit_transactions
            WHERE member_deposit_id = v_md_id
              AND transaction_type = 'deposit'
              AND (
                  COALESCE(description, '') ILIKE '%Saldo Awal%'
                  OR COALESCE(description, '') ILIKE '%Cut-Off%'
              )
        ) THEN
            INSERT INTO public.deposit_transactions (
                member_deposit_id,
                transaction_type,
                amount,
                for_month,
                for_year,
                description,
                reference_no,
                payment_method,
                notes,
                transaction_date,
                created_at
            ) VALUES (
                v_md_id,
                'deposit',
                v_rec.opening_amount,
                2,
                2026,
                'Saldo Awal Cut-Off (s/d Feb 2026)',
                NULL,
                'tunai',
                NULL,
                DATE '2026-03-01',
                TIMESTAMPTZ '2026-03-01T00:00:00+00:00'
            );
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
