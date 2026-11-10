-- File: supabase/migrations/042_admin_user_management.sql
-- Tujuan: Mengelola pengguna sistem (tambah, hapus, ubah role) secara aman via database RPC (SECURITY DEFINER)
--         sehingga frontend tidak lagi membutuhkan SERVICE_ROLE_KEY di browser/bundle.

-- 1. RPC: admin_update_user_role
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
    p_user_id UUID,
    p_role VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    -- Validasi caller harus memiliki role admin
    IF (SELECT auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin yang diizinkan mengubah hak akses.';
    END IF;

    -- Validasi nilai role yang valid
    IF p_role NOT IN ('admin', 'operator') THEN
        RAISE EXCEPTION 'Invalid role: Hanya role "admin" atau "operator" yang diperbolehkan.';
    END IF;

    -- Update metadata auth.users
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role),
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Update tabel profil public.pengelola
    UPDATE public.pengelola
    SET role = p_role
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

-- 2. RPC: admin_delete_user
CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    -- Validasi caller harus memiliki role admin
    IF (SELECT auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin yang diizinkan menghapus pengguna.';
    END IF;

    -- Cegah admin menghapus dirinya sendiri yang sedang aktif
    IF auth.uid() = p_user_id THEN
        RAISE EXCEPTION 'Tidak dapat menghapus akun admin yang sedang Anda gunakan.';
    END IF;

    -- Hapus dari tabel public.pengelola
    DELETE FROM public.pengelola WHERE id = p_user_id;

    -- Hapus dari auth.identities jika ada
    DELETE FROM auth.identities WHERE user_id = p_user_id;

    -- Hapus dari auth.users
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

-- 3. RPC: admin_create_user
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email TEXT,
    p_password TEXT,
    p_nama TEXT,
    p_role VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_encrypted_pw TEXT;
BEGIN
    -- Validasi caller harus memiliki role admin
    IF (SELECT auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin yang diizinkan mendaftarkan pengguna baru.';
    END IF;

    -- Validasi parameter
    IF LENGTH(TRIM(p_email)) < 3 OR POSITION('@' IN p_email) = 0 THEN
        RAISE EXCEPTION 'Email tidak valid.';
    END IF;

    IF LENGTH(p_password) < 6 THEN
        RAISE EXCEPTION 'Kata sandi minimal 6 karakter.';
    END IF;

    IF p_role NOT IN ('admin', 'operator') THEN
        RAISE EXCEPTION 'Invalid role: Hanya role "admin" atau "operator" yang diperbolehkan.';
    END IF;

    -- Cek duplikasi email
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email))) THEN
        RAISE EXCEPTION 'Email sudah terdaftar di sistem.';
    END IF;

    v_user_id := gen_random_uuid();
    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

    -- Masukkan ke auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        LOWER(TRIM(p_email)),
        v_encrypted_pw,
        NOW(),
        jsonb_build_object('provider', 'email', 'providers', json_build_array('email'), 'role', p_role),
        jsonb_build_object('nama', p_nama),
        NOW(),
        NOW()
    );

    -- Masukkan ke auth.identities
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', LOWER(TRIM(p_email))),
        'email',
        v_user_id::text,
        NOW(),
        NOW(),
        NOW()
    );

    -- Masukkan / sinkronkan ke public.pengelola
    INSERT INTO public.pengelola (id, nama, role)
    VALUES (v_user_id, p_nama, p_role)
    ON CONFLICT (id) DO UPDATE 
    SET nama = EXCLUDED.nama, role = EXCLUDED.role;

    RETURN jsonb_build_object(
        'id', v_user_id,
        'email', LOWER(TRIM(p_email)),
        'nama', p_nama,
        'role', p_role
    );
END;
$$;

-- Berikan izin eksekusi ke role authenticated
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, VARCHAR) TO authenticated;

