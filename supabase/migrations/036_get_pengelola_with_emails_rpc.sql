-- Migration: 036_get_pengelola_with_emails_rpc.sql
-- Description: RPC SECURITY DEFINER khusus Admin untuk mengambil daftar pengelola
--              beserta alamat email login lengkap dari auth.users.

CREATE OR REPLACE FUNCTION public.get_pengelola_with_emails()
RETURNS TABLE (
    id uuid,
    nama text,
    email text,
    role text,
    is_active boolean,
    can_access_pos boolean,
    can_access_opname boolean,
    opname_only_login boolean,
    deactivated_at timestamptz,
    deactivation_reason text,
    created_at timestamptz
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
        RAISE EXCEPTION 'Akses ditolak: Hanya Admin yang dapat melihat daftar email pengelola.';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.nama,
        u.email::text AS email,
        p.role,
        COALESCE(p.is_active, true) AS is_active,
        COALESCE(p.can_access_pos, true) AS can_access_pos,
        COALESCE(p.can_access_opname, true) AS can_access_opname,
        COALESCE(p.opname_only_login, false) AS opname_only_login,
        p.deactivated_at,
        p.deactivation_reason,
        p.created_at
    FROM public.pengelola p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pengelola_with_emails() TO authenticated;
