-- File: supabase/migrations/013_member_resignation_nrp_trigger.sql
-- Tujuan: Menambahkan kode (lama X) pada NRP jika anggota mengundurkan diri.

CREATE OR REPLACE FUNCTION public.handle_anggota_resignation()
RETURNS TRIGGER AS $$
DECLARE
    v_base_nrp TEXT;
    v_resign_count INT;
BEGIN
    -- Check if member is resigning (transitioning to nonaktif or RESIGNED/PENDING_RESIGNED)
    IF (NEW.status = 'nonaktif' AND OLD.status = 'aktif') OR 
       (NEW.membership_status IN ('RESIGNED', 'PENDING_RESIGNED') AND OLD.membership_status NOT IN ('RESIGNED', 'PENDING_RESIGNED')) THEN
        
        -- Get the base NRP (just in case they already have the prefix, although they shouldn't if they were active)
        v_base_nrp := NEW.nrp;
        IF v_base_nrp ~ '^\(lama [0-9]+\) ' THEN
            v_base_nrp := regexp_replace(v_base_nrp, '^\(lama [0-9]+\) ', '');
        END IF;

        -- Find the highest count of previous resignations for this base NRP
        SELECT COALESCE(MAX(
            substring(nrp from '^\(lama ([0-9]+)\) ')::int
        ), 0) INTO v_resign_count
        FROM public.anggota
        WHERE nrp LIKE '(lama %) ' || v_base_nrp 
           OR nrp = v_base_nrp;

        -- The new count is the number of previous resignations + 1
        v_resign_count := v_resign_count + 1;

        -- Update the NRP
        NEW.nrp := '(lama ' || v_resign_count || ') ' || v_base_nrp;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_anggota_resignation ON public.anggota;
CREATE TRIGGER trg_anggota_resignation
BEFORE UPDATE ON public.anggota
FOR EACH ROW
EXECUTE FUNCTION public.handle_anggota_resignation();
