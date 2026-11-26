-- Migration: 034_pengelola_deactivation_lifecycle.sql
-- Description: Menambahkan lifecycle penonaktifan staf (soft-deactivation) pada public.pengelola,
--              memperketat is_active_staff() dan RPC operator opname, serta mencegah penghapusan permanen
--              akun yang memiliki jejak transaksi, shift kasir, atau stock opname.

-- 1. Tambah kolom lifecycle pada public.pengelola
ALTER TABLE public.pengelola
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
    ADD COLUMN IF NOT EXISTS deactivation_reason text;

COMMENT ON COLUMN public.pengelola.is_active IS 'Status keaktifan akun staf (false jika karyawan keluar/resign/dinonaktifkan)';
COMMENT ON COLUMN public.pengelola.deactivated_at IS 'Waktu akun staf dinonaktifkan oleh admin';
COMMENT ON COLUMN public.pengelola.deactivation_reason IS 'Alasan penonaktifan akun staf (mis. Resign, Pindah Tugas)';

CREATE INDEX IF NOT EXISTS idx_pengelola_active_role
    ON public.pengelola (is_active, role);

-- 2. Perbarui fungsi is_active_staff() agar akun yang is_active = false ditolak
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pengelola
    WHERE id = auth.uid()
      AND COALESCE(is_active, true) = true
      AND (role = 'admin' OR role = 'kasir' OR role = 'operator')
  );
$$;

-- 3. Perbarui RPC get_opname_operators() agar menyertakan is_active
DROP FUNCTION IF EXISTS public.get_opname_operators();

CREATE OR REPLACE FUNCTION public.get_opname_operators()
RETURNS TABLE (
    id uuid,
    nama text,
    role text,
    created_at timestamptz,
    is_active boolean,
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
        COALESCE(p.is_active, true) AS is_active,
        p.can_access_pos,
        p.can_access_opname,
        p.opname_only_login
    FROM public.pengelola p
    WHERE p.role IN ('operator', 'kasir')
    ORDER BY p.created_at ASC, p.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_opname_operators() TO authenticated;

-- 4. Perbarui RPC get_operator_access_configs() agar hanya mengembalikan operator aktif
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
            WHERE pengelola.id = auth.uid()
              AND pengelola.role = 'admin'
              AND COALESCE(pengelola.is_active, true) = true
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin aktif yang diizinkan mengelola hak akses operator.';
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
      AND COALESCE(p.is_active, true) = true
    ORDER BY p.nama ASC, p.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_operator_access_configs() TO authenticated;

-- 5. Perbarui RPC admin_update_operator_access() agar menolak operator nonaktif
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
            WHERE pengelola.id = auth.uid()
              AND pengelola.role = 'admin'
              AND COALESCE(pengelola.is_active, true) = true
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin aktif yang diizinkan mengelola hak akses operator.';
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
      AND COALESCE(is_active, true) = true
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun operator tidak ditemukan, bukan role operator, atau sudah dinonaktifkan.';
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

-- 6. RPC Admin untuk menonaktifkan akun staf (soft-deactivation)
CREATE OR REPLACE FUNCTION public.admin_deactivate_user(
    p_user_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_updated public.pengelola%ROWTYPE;
    v_clean_reason text;
BEGIN
    IF NOT (
        (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR EXISTS (
            SELECT 1 FROM public.pengelola
            WHERE pengelola.id = auth.uid()
              AND pengelola.role = 'admin'
              AND COALESCE(pengelola.is_active, true) = true
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin aktif yang diizinkan menonaktifkan akun staf.';
    END IF;

    IF auth.uid() = p_user_id THEN
        RAISE EXCEPTION 'Tidak dapat menonaktifkan akun yang sedang Anda gunakan.';
    END IF;

    v_clean_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

    UPDATE public.pengelola
    SET
        is_active = false,
        can_access_pos = false,
        can_access_opname = false,
        opname_only_login = false,
        deactivated_at = NOW(),
        deactivation_reason = v_clean_reason
    WHERE id = p_user_id
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun pengelola tidak ditemukan.';
    END IF;

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'nama', v_updated.nama,
        'role', v_updated.role,
        'is_active', v_updated.is_active,
        'deactivated_at', v_updated.deactivated_at,
        'deactivation_reason', v_updated.deactivation_reason
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_deactivate_user(uuid, text) TO authenticated;

-- 7. RPC Admin untuk mengaktifkan kembali akun staf
CREATE OR REPLACE FUNCTION public.admin_reactivate_user(
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_updated public.pengelola%ROWTYPE;
BEGIN
    IF NOT (
        (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR EXISTS (
            SELECT 1 FROM public.pengelola
            WHERE pengelola.id = auth.uid()
              AND pengelola.role = 'admin'
              AND COALESCE(pengelola.is_active, true) = true
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin aktif yang diizinkan mengaktifkan kembali akun staf.';
    END IF;

    UPDATE public.pengelola
    SET
        is_active = true,
        can_access_pos = true,
        can_access_opname = true,
        opname_only_login = false,
        deactivated_at = NULL,
        deactivation_reason = NULL
    WHERE id = p_user_id
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun pengelola tidak ditemukan.';
    END IF;

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'nama', v_updated.nama,
        'role', v_updated.role,
        'is_active', v_updated.is_active
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reactivate_user(uuid) TO authenticated;

-- 8. RPC Admin untuk memeriksa ringkasan riwayat transaksi/shift/opname tiap staf
CREATE OR REPLACE FUNCTION public.admin_get_user_activity_counts()
RETURNS TABLE (
    user_id uuid,
    sales_count bigint,
    shifts_count bigint,
    opname_tasks_count bigint
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
            WHERE pengelola.id = auth.uid()
              AND pengelola.role = 'admin'
              AND COALESCE(pengelola.is_active, true) = true
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin aktif yang diizinkan melihat ringkasan aktivitas staf.';
    END IF;

    RETURN QUERY
    SELECT
        p.id AS user_id,
        (SELECT COUNT(*) FROM public.sales s WHERE s.cashier_id = p.id) AS sales_count,
        (SELECT COUNT(*) FROM public.cashier_shifts cs WHERE cs.cashier_id = p.id) AS shifts_count,
        (
            SELECT COUNT(*)
            FROM public.stock_opname_tasks t
            WHERE t.assigned_operator_id = p.id
               OR t.recount_operator_id = p.id
               OR t.reassigned_from_operator_id = p.id
        ) AS opname_tasks_count
    FROM public.pengelola p;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_activity_counts() TO authenticated;

-- 9. Perketat RPC admin_delete_user agar tidak menghapus permanen akun yang memiliki riwayat
CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    IF (SELECT auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin yang diizinkan menghapus pengguna.';
    END IF;

    IF auth.uid() = p_user_id THEN
        RAISE EXCEPTION 'Tidak dapat menghapus akun admin yang sedang Anda gunakan.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.sales WHERE cashier_id = p_user_id)
       OR EXISTS (SELECT 1 FROM public.cashier_shifts WHERE cashier_id = p_user_id)
       OR EXISTS (
           SELECT 1 FROM public.stock_opname_tasks
           WHERE assigned_operator_id = p_user_id
              OR recount_operator_id = p_user_id
              OR reassigned_from_operator_id = p_user_id
       ) THEN
        RAISE EXCEPTION 'Akun ini sudah memiliki riwayat transaksi, shift kasir, atau stock opname. Gunakan aksi Nonaktifkan Akun agar jejak audit tetap terjaga.';
    END IF;

    DELETE FROM public.pengelola WHERE id = p_user_id;
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
