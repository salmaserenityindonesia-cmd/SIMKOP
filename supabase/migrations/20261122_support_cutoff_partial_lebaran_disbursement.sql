-- Migration: 20261122_support_cutoff_partial_lebaran_disbursement.sql
-- Description: Memperbarui RPC execute_bulk_lebaran_disbursement agar menghitung hak cair Simpanan Lebaran
--              secara dinamis berdasarkan p_cutoff_date (Saldo Awal Cut-Off + setoran bulanan dengan
--              periode < bulan cut-off + setoran non-bulanan <= cut-off - penarikan <= cut-off),
--              mencairkan tepat sebesar hak cair tersebut pada tanggal p_cutoff_date tanpa menghapus
--              status lunas bulan-bulan berikutnya yang sudah dibayar.

-- 1. Hapus signature overload lama agar pemanggilan PostgREST tidak ambigu
DROP FUNCTION IF EXISTS public.execute_bulk_lebaran_disbursement(UUID, UUID);
DROP FUNCTION IF EXISTS public.execute_bulk_lebaran_disbursement(UUID, UUID, DATE);

-- 2. Buat ulang RPC execute_bulk_lebaran_disbursement dengan kalkulasi hak cair berbasis p_cutoff_date
CREATE OR REPLACE FUNCTION public.execute_bulk_lebaran_disbursement(
    p_cycle_id UUID,
    p_approver_id UUID DEFAULT NULL,
    p_cutoff_date DATE DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_cycle RECORD;
    v_record RECORD;
    v_total_members INTEGER := 0;
    v_total_amount NUMERIC := 0;
    v_tx_id UUID;
    v_year TEXT;
    v_cutoff_ym TEXT;
    v_ref_no TEXT;
    v_approver_valid_id UUID := NULL;
    v_audit_table_exists BOOLEAN := FALSE;
    v_cash_flow_table_exists BOOLEAN := FALSE;
    v_cf_has_tx_date BOOLEAN := FALSE;
    v_cf_has_description BOOLEAN := FALSE;
    v_formatted_total TEXT;
    v_bulk_cf_description TEXT;
    v_effective_date DATE;
    v_effective_ts TIMESTAMPTZ;
    v_date_conflict BOOLEAN := FALSE;
BEGIN
    -- Validasi ID siklus
    IF p_cycle_id IS NULL THEN
        RAISE EXCEPTION 'ID siklus pencairan (cycle_id) wajib diisi.';
    END IF;

    -- Kunci baris siklus pencairan untuk mencegah race condition (FOR UPDATE)
    SELECT * INTO v_cycle
    FROM public.lebaran_disbursement_cycles
    WHERE id = p_cycle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Siklus pencairan lebaran dengan ID % tidak ditemukan.', p_cycle_id;
    END IF;

    IF v_cycle.status NOT IN ('DRAFT', 'APPROVED') THEN
        RAISE EXCEPTION 'Siklus pencairan lebaran tidak dapat dieksekusi karena berstatus %.', v_cycle.status;
    END IF;

    -- Validasi foreign key approver jika disediakan
    v_approver_valid_id := COALESCE(p_approver_id, auth.uid());
    IF v_approver_valid_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_approver_valid_id) THEN
            v_approver_valid_id := NULL;
        END IF;
    END IF;

    -- Hitung tanggal, tahun-bulan cut-off (YYYY-MM), dan timestamp efektif pencairan
    v_effective_date := COALESCE(
        p_cutoff_date,
        (v_cycle.cut_off_date AT TIME ZONE 'Asia/Jakarta')::DATE,
        v_cycle.disbursement_date,
        CURRENT_DATE
    );
    v_effective_ts := (v_effective_date::TEXT || ' 12:00:00+07')::TIMESTAMPTZ;
    v_year := TO_CHAR(v_effective_date, 'YYYY');
    v_cutoff_ym := TO_CHAR(v_effective_date, 'YYYY-MM');

    -- Deteksi ketersediaan tabel cash_flow beserta kolom opsionalnya
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'cash_flow'
    ) INTO v_cash_flow_table_exists;

    IF v_cash_flow_table_exists THEN
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'cash_flow' AND column_name = 'transaction_date'
        ) INTO v_cf_has_tx_date;

        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'cash_flow' AND column_name = 'description'
        ) INTO v_cf_has_description;
    END IF;

    -- Iterasi setiap anggota aktif yang memiliki hak cair simpanan lebaran s/d v_effective_date > 0
    FOR v_record IN
        WITH member_balances AS (
            SELECT
                m.id AS member_id,
                m.nrp AS member_nrp,
                m.nama AS member_nama,
                md.id AS member_deposit_id,
                COALESCE(SUM(
                    CASE
                        WHEN tx.transaction_type = 'deposit' THEN tx.amount
                        WHEN tx.transaction_type = 'withdrawal' THEN -tx.amount
                        ELSE 0
                    END
                ), 0)::NUMERIC AS current_balance,
                COALESCE(SUM(
                    CASE
                        WHEN tx.transaction_type = 'deposit' AND (
                            (
                                (
                                    COALESCE(tx.description, '') ILIKE '%saldo awal%'
                                    OR COALESCE(tx.description, '') ILIKE '%cut-off%'
                                    OR COALESCE(tx.description, '') ILIKE '%cutoff%'
                                    OR COALESCE(tx.notes, '') ILIKE '%saldo awal%'
                                    OR COALESCE(tx.notes, '') ILIKE '%cut-off%'
                                    OR COALESCE(tx.notes, '') ILIKE '%cutoff%'
                                )
                                AND (
                                    (
                                        tx.for_year IS NOT NULL
                                        AND tx.for_month IS NOT NULL
                                        AND (LPAD(tx.for_year::TEXT, 4, '0') || '-' || LPAD(tx.for_month::TEXT, 2, '0')) < v_cutoff_ym
                                    )
                                    OR COALESCE(tx.transaction_date, (tx.created_at AT TIME ZONE 'Asia/Jakarta')::DATE) <= v_effective_date
                                    OR (tx.transaction_date IS NULL AND tx.created_at IS NULL)
                                )
                            )
                            OR (
                                NOT (
                                    COALESCE(tx.description, '') ILIKE '%saldo awal%'
                                    OR COALESCE(tx.description, '') ILIKE '%cut-off%'
                                    OR COALESCE(tx.description, '') ILIKE '%cutoff%'
                                    OR COALESCE(tx.notes, '') ILIKE '%saldo awal%'
                                    OR COALESCE(tx.notes, '') ILIKE '%cut-off%'
                                    OR COALESCE(tx.notes, '') ILIKE '%cutoff%'
                                )
                                AND tx.for_year IS NOT NULL
                                AND tx.for_month IS NOT NULL
                                AND (LPAD(tx.for_year::TEXT, 4, '0') || '-' || LPAD(tx.for_month::TEXT, 2, '0')) < v_cutoff_ym
                            )
                            OR (
                                NOT (
                                    COALESCE(tx.description, '') ILIKE '%saldo awal%'
                                    OR COALESCE(tx.description, '') ILIKE '%cut-off%'
                                    OR COALESCE(tx.description, '') ILIKE '%cutoff%'
                                    OR COALESCE(tx.notes, '') ILIKE '%saldo awal%'
                                    OR COALESCE(tx.notes, '') ILIKE '%cut-off%'
                                    OR COALESCE(tx.notes, '') ILIKE '%cutoff%'
                                )
                                AND (tx.for_year IS NULL OR tx.for_month IS NULL)
                                AND COALESCE(tx.transaction_date, (tx.created_at AT TIME ZONE 'Asia/Jakarta')::DATE, v_effective_date) <= v_effective_date
                            )
                        ) THEN tx.amount
                        WHEN tx.transaction_type = 'withdrawal'
                             AND COALESCE(tx.transaction_date, (tx.created_at AT TIME ZONE 'Asia/Jakarta')::DATE, v_effective_date) <= v_effective_date
                        THEN -tx.amount
                        ELSE 0
                    END
                ), 0)::NUMERIC AS raw_eligible_amount
            FROM public.anggota m
            JOIN public.member_deposits md ON md.member_id = m.id
            JOIN public.deposit_types dt ON dt.id = md.deposit_type_id
            LEFT JOIN public.deposit_transactions tx ON tx.member_deposit_id = md.id
            WHERE LOWER(m.status) = 'aktif'
              AND (
                  dt.code ILIKE '%LEBARAN%'
                  OR dt.code = 'SL'
                  OR dt.code = 'THR'
                  OR dt.name ILIKE '%LEBARAN%'
                  OR dt.name ILIKE '%HARI RAYA%'
              )
            GROUP BY m.id, m.nrp, m.nama, md.id
        )
        SELECT
            member_id,
            member_nrp,
            member_nama,
            member_deposit_id,
            current_balance,
            raw_eligible_amount,
            GREATEST(0, LEAST(current_balance, raw_eligible_amount))::NUMERIC AS eligible_amount
        FROM member_balances
        WHERE GREATEST(0, LEAST(current_balance, raw_eligible_amount)) > 0
        ORDER BY member_nama ASC
    LOOP
        -- Format nomor kwitansi unik: KW-THR-[YEAR]-[NRP]
        v_ref_no := 'KW-THR-' || v_year || '-' || COALESCE(NULLIF(TRIM(v_record.member_nrp), ''), 'ANGGOTA');

        -- Sisipkan transaksi penarikan tepat sebesar eligible_amount pada tanggal cut-off efektif
        -- Tanpa menghapus mutasi deposit bulan berjalan atau bulan setelah cut-off agar status lunas tetap terjaga
        INSERT INTO public.deposit_transactions (
            member_deposit_id,
            transaction_date,
            transaction_type,
            amount,
            description,
            reference_no,
            payment_method,
            notes,
            created_by,
            created_at
        ) VALUES (
            v_record.member_deposit_id,
            v_effective_date,
            'withdrawal',
            v_record.eligible_amount,
            'Pencairan Massal Simpanan Lebaran - ' || v_cycle.cycle_name,
            v_ref_no,
            'transfer',
            'Pencairan Massal Simpanan Lebaran (Cut-Off ' || TO_CHAR(v_effective_date, 'DD/MM/YYYY') || ')',
            v_approver_valid_id,
            v_effective_ts
        ) RETURNING id INTO v_tx_id;

        -- Akumulasi counter dan total dana cair
        v_total_members := v_total_members + 1;
        v_total_amount := v_total_amount + v_record.eligible_amount;
    END LOOP;

    -- Catat 1 baris agregat pengeluaran kas ke public.cash_flow jika tersedia
    IF v_cash_flow_table_exists AND v_total_members > 0 AND v_total_amount > 0 THEN
        BEGIN
            v_formatted_total := REPLACE(TRIM(TO_CHAR(ROUND(v_total_amount), '999,999,999,999')), ',', '.');
            v_bulk_cf_description := 'Pencairan Massal Simpanan Lebaran (' || v_cycle.cycle_name || ') — ' || v_total_members || ' Anggota (Rp ' || v_formatted_total || ')';

            IF v_cf_has_tx_date AND v_cf_has_description THEN
                EXECUTE '
                    INSERT INTO public.cash_flow (direction, amount, category, reference_id, description, transaction_date, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                ' USING 'out', ROUND(v_total_amount), 'penarikan_simpanan', p_cycle_id, v_bulk_cf_description, v_effective_date, v_effective_ts;
            ELSIF v_cf_has_description THEN
                EXECUTE '
                    INSERT INTO public.cash_flow (direction, amount, category, reference_id, description, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                ' USING 'out', ROUND(v_total_amount), 'penarikan_simpanan', p_cycle_id, v_bulk_cf_description, v_effective_ts;
            ELSIF v_cf_has_tx_date THEN
                EXECUTE '
                    INSERT INTO public.cash_flow (direction, amount, category, reference_id, transaction_date, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                ' USING 'out', ROUND(v_total_amount), 'penarikan_simpanan', p_cycle_id, v_effective_date, v_effective_ts;
            ELSE
                INSERT INTO public.cash_flow (
                    direction,
                    amount,
                    category,
                    reference_id,
                    created_at
                ) VALUES (
                    'out',
                    ROUND(v_total_amount),
                    'penarikan_simpanan',
                    p_cycle_id,
                    v_effective_ts
                );
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;
    END IF;

    -- Cek konflik constraint unik disbursement_date sebelum memperbarui baris siklus
    SELECT EXISTS (
        SELECT 1
        FROM public.lebaran_disbursement_cycles
        WHERE disbursement_date = v_effective_date
          AND id <> p_cycle_id
    ) INTO v_date_conflict;

    IF NOT v_date_conflict THEN
        UPDATE public.lebaran_disbursement_cycles
        SET status = 'COMPLETED',
            disbursement_date = v_effective_date,
            cut_off_date = v_effective_ts,
            approved_by = v_approver_valid_id,
            approved_at = v_effective_ts,
            created_at = v_effective_ts,
            total_members = v_total_members,
            total_amount = v_total_amount,
            updated_at = TIMEZONE('utc'::text, NOW())
        WHERE id = p_cycle_id;
    ELSE
        UPDATE public.lebaran_disbursement_cycles
        SET status = 'COMPLETED',
            cut_off_date = v_effective_ts,
            approved_by = v_approver_valid_id,
            approved_at = v_effective_ts,
            created_at = v_effective_ts,
            total_members = v_total_members,
            total_amount = v_total_amount,
            updated_at = TIMEZONE('utc'::text, NOW())
        WHERE id = p_cycle_id;
    END IF;

    -- Catat jejak audit pada audit_logs jika tabel tersedia
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
    ) INTO v_audit_table_exists;

    IF v_audit_table_exists THEN
        BEGIN
            INSERT INTO public.audit_logs (
                table_name,
                action,
                record_id,
                entity_name,
                entity_id,
                performed_by,
                performer_name,
                notes,
                new_data,
                created_at
            ) VALUES (
                'lebaran_disbursement_cycles',
                'EXECUTE',
                p_cycle_id::TEXT,
                'lebaran_disbursement_cycles',
                p_cycle_id,
                v_approver_valid_id,
                'Approver / Admin',
                'Eksekusi massal pencairan simpanan lebaran (cut-off ' || v_effective_date || '): ' || v_cycle.cycle_name || ' (' || v_total_members || ' anggota, total Rp ' || v_total_amount || ')',
                jsonb_build_object(
                    'cycle_id', p_cycle_id,
                    'cycle_name', v_cycle.cycle_name,
                    'disbursement_date', v_effective_date,
                    'cut_off_date', v_effective_ts,
                    'total_members', v_total_members,
                    'total_amount', v_total_amount,
                    'approved_by', v_approver_valid_id,
                    'status', 'COMPLETED'
                ),
                TIMEZONE('utc'::text, NOW())
            );
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;
    END IF;

    -- Kembalikan output JSONB terstruktur
    RETURN jsonb_build_object(
        'success', true,
        'cycle_id', p_cycle_id,
        'cycle_name', v_cycle.cycle_name,
        'disbursement_date', v_effective_date,
        'cut_off_date', v_effective_ts,
        'total_members', v_total_members,
        'total_amount', v_total_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.execute_bulk_lebaran_disbursement(UUID, UUID, DATE) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.execute_bulk_lebaran_disbursement(UUID, UUID, DATE)
IS 'Mengeksekusi penarikan hak cair simpanan lebaran berdasarkan tanggal cut-off p_cutoff_date untuk seluruh anggota aktif secara atomik tanpa menghapus status lunas setoran bulan-bulan berikutnya.';

NOTIFY pgrst, 'reload schema';
