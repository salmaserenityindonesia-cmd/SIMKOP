-- File: supabase/migrations/20261127_fix_staff_registration_auth_schema.sql
-- Tujuan: Memperbaiki pendaftaran user baru di /admin/users agar tidak menghasilkan kolom token NULL
--         pada auth.users, menyisipkan baris identitas ke auth.identities, serta menyinkronkan ke public.pengelola.

-- 1. Backfill seluruh baris auth.users yang sudah ada agar kolom token GoTrue tidak bernilai NULL
UPDATE auth.users
SET
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    aud = COALESCE(NULLIF(aud, ''), 'authenticated'),
    role = COALESCE(NULLIF(role, ''), 'authenticated'),
    email_confirmed_at = COALESCE(email_confirmed_at, created_at, NOW()),
    is_sso_user = COALESCE(is_sso_user, false),
    is_anonymous = COALESCE(is_anonymous, false),
    updated_at = NOW()
WHERE
    confirmation_token IS NULL
    OR recovery_token IS NULL
    OR email_change_token_new IS NULL
    OR email_change IS NULL
    OR email_change_token_current IS NULL
    OR reauthentication_token IS NULL
    OR phone_change IS NULL
    OR phone_change_token IS NULL
    OR aud IS NULL
    OR aud = ''
    OR role IS NULL
    OR role = ''
    OR is_sso_user IS NULL
    OR is_anonymous IS NULL;

-- Pastikan metadata provider email terisi pada auth.users yang belum memiliki key 'provider'
UPDATE auth.users
SET
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    updated_at = NOW()
WHERE
    email IS NOT NULL
    AND (raw_app_meta_data IS NULL OR NOT (raw_app_meta_data ? 'provider'));

-- 2. Backfill auth.identities untuk akun auth.users yang belum memiliki identitas provider 'email'
INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    u.id,
    jsonb_build_object(
        'sub', u.id::text,
        'email', LOWER(TRIM(u.email)),
        'email_verified', true,
        'phone_verified', false
    ),
    'email',
    u.id::text,
    COALESCE(u.last_sign_in_at, u.created_at, NOW()),
    COALESCE(u.created_at, NOW()),
    NOW()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM auth.identities i
      WHERE i.user_id = u.id
        AND i.provider = 'email'
  );

-- 3. Perbarui fungsi RPC public.admin_create_user agar mengisi seluruh kolom GoTrue, auth.identities, & public.pengelola
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
    v_normalized_email TEXT;
    v_trimmed_nama TEXT;
BEGIN
    -- Validasi caller harus memiliki role admin
    IF (SELECT auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Hanya admin yang diizinkan mendaftarkan pengguna baru.';
    END IF;

    v_normalized_email := LOWER(TRIM(p_email));
    v_trimmed_nama := TRIM(p_nama);

    -- Validasi parameter
    IF v_normalized_email IS NULL OR LENGTH(v_normalized_email) < 3 OR POSITION('@' IN v_normalized_email) = 0 THEN
        RAISE EXCEPTION 'Email tidak valid.';
    END IF;

    IF p_password IS NULL OR LENGTH(p_password) < 6 THEN
        RAISE EXCEPTION 'Kata sandi minimal 6 karakter.';
    END IF;

    IF v_trimmed_nama IS NULL OR LENGTH(v_trimmed_nama) = 0 THEN
        RAISE EXCEPTION 'Nama pengguna wajib diisi.';
    END IF;

    IF p_role NOT IN ('admin', 'operator') THEN
        RAISE EXCEPTION 'Invalid role: Hanya role "admin" atau "operator" yang diperbolehkan.';
    END IF;

    -- Cek duplikasi email
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_normalized_email) THEN
        RAISE EXCEPTION 'Email sudah terdaftar di sistem.';
    END IF;

    v_user_id := gen_random_uuid();
    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

    -- Masukkan ke auth.users dengan seluruh kolom token GoTrue bernilai string kosong ('')
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        email_change_token_current,
        reauthentication_token,
        phone_change,
        phone_change_token,
        is_sso_user,
        is_anonymous,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        v_normalized_email,
        v_encrypted_pw,
        NOW(),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        false,
        false,
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email'], 'role', p_role),
        jsonb_build_object('nama', v_trimmed_nama),
        NOW(),
        NOW()
    );

    -- Masukkan pasangan baris identitas ke auth.identities
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
        jsonb_build_object(
            'sub', v_user_id::text,
            'email', v_normalized_email,
            'email_verified', true,
            'phone_verified', false
        ),
        'email',
        v_user_id::text,
        NOW(),
        NOW(),
        NOW()
    );

    -- Masukkan / sinkronkan ke public.pengelola dengan is_active = true dan izin modul default
    INSERT INTO public.pengelola (
        id,
        nama,
        role,
        is_active,
        can_access_pos,
        can_access_opname
    ) VALUES (
        v_user_id,
        v_trimmed_nama,
        p_role,
        true,
        true,
        true
    )
    ON CONFLICT (id) DO UPDATE
    SET
        nama = EXCLUDED.nama,
        role = EXCLUDED.role,
        is_active = true,
        can_access_pos = true,
        can_access_opname = true;

    RETURN jsonb_build_object(
        'id', v_user_id,
        'email', v_normalized_email,
        'nama', v_trimmed_nama,
        'role', p_role
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, VARCHAR) TO authenticated;
