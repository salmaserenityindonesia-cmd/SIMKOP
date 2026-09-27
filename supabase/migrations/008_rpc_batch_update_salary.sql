-- File: supabase/migrations/008_rpc_batch_update_salary.sql

CREATE OR REPLACE FUNCTION public.batch_update_salary_reconciliation(
    payload JSONB,
    admin_id UUID
) RETURNS void AS $$
DECLARE
    item JSONB;
    v_nrp TEXT;
    v_thp NUMERIC;
    v_new_account TEXT;
    v_anggota_id UUID;
    v_old_account TEXT;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(payload)
    LOOP
        v_nrp := item->>'nrp';
        v_thp := (item->>'take_home_pay')::NUMERIC;
        v_new_account := item->>'final_account_number';
        
        -- Get current record
        SELECT id, bank_account_number INTO v_anggota_id, v_old_account
        FROM public.anggota
        WHERE nrp = v_nrp;
        
        IF FOUND THEN
            -- Update anggota
            UPDATE public.anggota
            SET take_home_pay = v_thp,
                bank_account_number = v_new_account
            WHERE id = v_anggota_id;
            
            -- If account number changed, insert into audit log
            IF (v_old_account IS DISTINCT FROM v_new_account) THEN
                INSERT INTO public.rekening_audit_logs (
                    anggota_id, old_account_number, new_account_number, changed_by
                ) VALUES (
                    v_anggota_id, v_old_account, v_new_account, admin_id
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
