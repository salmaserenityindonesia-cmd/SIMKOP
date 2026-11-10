// File: functions/api/manage-users.ts
// Cloudflare Pages Function (runs at /api/manage-users)
// Reads server-side environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

export async function onRequest(context: any) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = request.headers.get('Authorization') || '';
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error: 'Konfigurasi server Cloudflare Pages (SUPABASE_SERVICE_ROLE_KEY) belum disetel di Dashboard Settings.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace(/Bearer /i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Sesi tidak valid' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify caller is admin
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey || 'placeholder', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);

    if (userError || !user || user.app_metadata?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized: Hanya admin yang diizinkan' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await request.json();
    const { action } = body;

    if (action === 'createUser') {
      const { email, password, nama, role } = body;
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nama },
        app_metadata: { role: role || 'operator' },
      });
      if (authError) throw authError;

      if (authData.user) {
        await supabaseAdmin.from('pengelola').upsert([
          { id: authData.user.id, nama, role: role || 'operator' },
        ]);
      }

      return new Response(JSON.stringify({ success: true, user: authData.user }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'deleteUser') {
      const { userId } = body;
      if (userId === user.id) {
        return new Response(
          JSON.stringify({ error: 'Tidak dapat menghapus akun admin yang sedang aktif' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) throw authError;

      await supabaseAdmin.from('pengelola').delete().eq('id', userId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'updateRole') {
      const { userId, newRole } = body;
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: { role: newRole },
      });
      if (authError) throw authError;

      const { error: dbError } = await supabaseAdmin
        .from('pengelola')
        .update({ role: newRole })
        .eq('id', userId);
      if (dbError) throw dbError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Action '${action}' tidak dikenal` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

