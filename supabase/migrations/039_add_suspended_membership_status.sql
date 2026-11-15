ALTER TABLE public.anggota
DROP CONSTRAINT IF EXISTS anggota_membership_status_check;

ALTER TABLE public.anggota
ADD CONSTRAINT anggota_membership_status_check
CHECK (membership_status::text = ANY (ARRAY[
  'ACTIVE'::character varying,
  'SUSPENDED'::character varying,
  'PENDING_RESIGNED'::character varying,
  'READY_TO_RESIGN'::character varying,
  'RESIGNED'::character varying,
  'BLOCKED'::character varying
]::text[]));

ALTER TABLE public.anggota
ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS suspension_reason text;

-- Perbarui trigger fungsi agar pembekuan sementara (SUSPENDED) dan pemblokiran (BLOCKED)
-- tidak memicu pengubahan NRP menjadi '(lama X) <NRP>' saat status disinkronkan ke 'nonaktif'.
CREATE OR REPLACE FUNCTION public.handle_anggota_resignation()
RETURNS TRIGGER AS $$
DECLARE
    v_base_nrp TEXT;
    v_resign_count INT;
BEGIN
    IF NEW.membership_status IN ('SUSPENDED', 'BLOCKED') THEN
        RETURN NEW;
    END IF;

    IF (NEW.status = 'nonaktif' AND OLD.status = 'aktif') OR 
       (NEW.membership_status IN ('RESIGNED', 'PENDING_RESIGNED') AND COALESCE(OLD.membership_status, 'ACTIVE') NOT IN ('RESIGNED', 'PENDING_RESIGNED')) THEN
        
        IF NEW.nrp IS NOT NULL AND NEW.nrp NOT LIKE '(lama%' THEN
            v_base_nrp := TRIM(NEW.nrp);
            
            SELECT COUNT(*) INTO v_resign_count
            FROM public.anggota
            WHERE (nrp = v_base_nrp OR nrp LIKE '(lama%) ' || v_base_nrp)
              AND id != NEW.id;
              
            v_resign_count := v_resign_count + 1;
            NEW.nrp := '(lama ' || v_resign_count || ') ' || v_base_nrp;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
