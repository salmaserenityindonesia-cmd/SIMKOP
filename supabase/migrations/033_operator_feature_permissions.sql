-- Migration: 033_operator_feature_permissions.sql
-- Description: Menambahkan pengaturan hak akses granular per operator (Kasir POS vs Cek Fisik Inventory)
--              serta mode login langsung ke halaman Cek Fisik Inventory saja tanpa membuka shift kasir.

-- 1. Tambah kolom hak akses fitur pada tabel public.pengelola
ALTER TABLE public.pengelola
    ADD COLUMN IF NOT EXISTS can_access_pos boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS can_access_opname boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS opname_only_login boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pengelola.can_access_pos IS 'Izin mengakses modul Kasir POS dan membuka shift kasir';
COMMENT ON COLUMN public.pengelola.can_access_opname IS 'Izin mengakses modul Cek Fisik Inventory dan masuk ke rotasi tugas opname harian';
COMMENT ON COLUMN public.pengelola.opname_only_login IS 'Jika true, akun langsung diarahkan ke halaman Cek Fisik Inventory saja saat login tanpa modal Buka Shift Kasir';

-- 2. Perbarui RPC get_opname_operators() agar menyertakan flag hak akses fitur
DROP FUNCTION IF EXISTS public.get_opname_operators();

CREATE OR REPLACE FUNCTION public.get_opname_operators()
RETURNS TABLE (
    id uuid,
    nama text,
    role text,
    created_at timestamptz,
    can_access_pos boolean,
    can_access_opname boolean,
    opname_only_login boolean
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
    SELECT
        p.id,
        p.nama,
        p.role,
        p.created_at,
        p.can_access_pos,
        p.can_access_opname,
        p.opname_only_login
    FROM public.pengelola p
    WHERE p.role IN ('operator', 'kasir')
    ORDER BY p.created_at ASC, p.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_opname_operators() TO authenticated;

-- 3. RPC Admin untuk membaca konfigurasi hak akses seluruh operator beserta email
CREATE OR REPLACE FUNCTION public.get_operator_access_configs()
RETURNS TABLE (
    id uuid,
    nama text,
    email text,
    role text,
    created_at timestamptz,
    can_access_pos boolean,
    can_access_opname boolean,
    opname_only_login boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT (
        (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR EXISTS (
            SELECT 1 FROM public.pengelola
            WHERE pengelola.id = auth.uid() AND pengelola.role = 'admin'
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin yang diizinkan mengelola hak akses operator.';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.nama,
        u.email::text,
        p.role,
        p.created_at,
        p.can_access_pos,
        p.can_access_opname,
        p.opname_only_login
    FROM public.pengelola p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.role IN ('operator', 'kasir')
    ORDER BY p.nama ASC, p.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_operator_access_configs() TO authenticated;

-- 4. RPC Admin untuk memperbarui hak akses fitur operator dengan validasi konsistensi
CREATE OR REPLACE FUNCTION public.admin_update_operator_access(
    p_operator_id uuid,
    p_can_access_pos boolean,
    p_can_access_opname boolean,
    p_opname_only_login boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_can_pos boolean;
    v_can_opname boolean;
    v_opname_only boolean;
    v_updated public.pengelola%ROWTYPE;
BEGIN
    IF NOT (
        (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR EXISTS (
            SELECT 1 FROM public.pengelola
            WHERE pengelola.id = auth.uid() AND pengelola.role = 'admin'
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin yang diizinkan mengelola hak akses operator.';
    END IF;

    v_can_pos := COALESCE(p_can_access_pos, true);
    v_can_opname := COALESCE(p_can_access_opname, true);
    v_opname_only := COALESCE(p_opname_only_login, false);

    IF v_opname_only THEN
        v_can_opname := true;
    END IF;

    IF NOT v_can_pos AND NOT v_can_opname THEN
        RAISE EXCEPTION 'Operator harus memiliki minimal satu akses fitur (Kasir POS atau Cek Fisik Inventory).';
    END IF;

    IF NOT v_can_pos AND v_can_opname THEN
        v_opname_only := true;
    END IF;

    IF NOT v_can_opname THEN
        v_opname_only := false;
    END IF;

    UPDATE public.pengelola
    SET
        can_access_pos = v_can_pos,
        can_access_opname = v_can_opname,
        opname_only_login = v_opname_only
    WHERE id = p_operator_id
      AND role IN ('operator', 'kasir')
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun operator tidak ditemukan atau bukan role operator.';
    END IF;

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'nama', v_updated.nama,
        'role', v_updated.role,
        'can_access_pos', v_updated.can_access_pos,
        'can_access_opname', v_updated.can_access_opname,
        'opname_only_login', v_updated.opname_only_login
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_operator_access(uuid, boolean, boolean, boolean) TO authenticated;
