-- Migration: 035_admin_reset_user_password_rpc.sql
-- Description: RPC SECURITY DEFINER khusus Admin aktif untuk mereset / mengganti
--              kata sandi akun pengelola (kasir/operator/admin) di auth.users
--              serta mencatat jejak audit ke public.audit_logs.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_target_user_id uuid,
    p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_target_name text;
    v_caller_id uuid := auth.uid();
    v_caller_name text;
    v_clean_password text := trim(COALESCE(p_new_password, ''));
BEGIN
    -- 1. Pastikan pemanggil adalah Admin aktif
    IF NOT (
        (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR EXISTS (
            SELECT 1 FROM public.pengelola
            WHERE pengelola.id = auth.uid()
              AND pengelola.role = 'admin'
              AND COALESCE(pengelola.is_active, true) = true
        )
    ) THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Admin yang dapat mengganti kata sandi pengguna.';
    END IF;

    -- 2. Validasi panjang password minimal 6 karakter
    IF char_length(v_clean_password) < 6 THEN
        RAISE EXCEPTION 'Kata sandi baru minimal harus terdiri dari 6 karakter.';
    END IF;

    -- 3. Pastikan user target ada di auth.users
    SELECT COALESCE(p.nama, u.email, p_target_user_id::text)
    INTO v_target_name
    FROM auth.users u
    LEFT JOIN public.pengelola p ON p.id = u.id
    WHERE u.id = p_target_user_id;

    IF v_target_name IS NULL THEN
        RAISE EXCEPTION 'Akun pengguna tidak ditemukan di sistem autentikasi.';
    END IF;

    SELECT p.nama INTO v_caller_name
    FROM public.pengelola p
    WHERE p.id = v_caller_id;

    -- 4. Perbarui encrypted_password di auth.users
    UPDATE auth.users
    SET
        encrypted_password = extensions.crypt(v_clean_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = p_target_user_id;

    -- 5. Catat ke audit_logs
    INSERT INTO public.audit_logs (
        table_name,
        action,
        record_id,
        entity_name,
        entity_id,
        performed_by,
        performer_name,
        notes,
        created_at
    ) VALUES (
        'pengelola',
        'RESET_PASSWORD',
        p_target_user_id::text,
        'pengelola',
        p_target_user_id,
        v_caller_id,
        COALESCE(v_caller_name, 'Admin'),
        'Admin mereset kata sandi akun: ' || v_target_name,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Kata sandi untuk ' || v_target_name || ' berhasil diperbarui.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(uuid, text) TO authenticated;
