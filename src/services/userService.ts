import { supabase } from '../lib/supabaseClient';

export interface CreateUserData {
  email: string;
  password: string;
  nama: string;
  role: 'admin' | 'operator';
}

/**
 * Mendaftarkan pengguna baru sistem (auth.users + public.pengelola)
 * Menggunakan strategi aman berjenjang:
 * 1. Database RPC `admin_create_user` (SECURITY DEFINER)
 * 2. Supabase Edge Function `manage-users`
 * 3. Cloudflare Pages Function `/api/manage-users`
 */
export async function createSystemUser(data: CreateUserData): Promise<{ success: boolean; user?: any; error?: string }> {
  const { email, password, nama, role } = data;

  // 1. Coba via Database RPC (PostgreSQL SECURITY DEFINER)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_create_user', {
      p_email: email,
      p_password: password,
      p_nama: nama,
      p_role: role,
    });

    if (!rpcError && rpcData) {
      return { success: true, user: rpcData };
    }

    // Jika error spesifik validasi (bukan function missing), lempar pesan
    if (rpcError && rpcError.code !== '42883' && !rpcError.message?.toLowerCase().includes('does not exist')) {
      return { success: false, error: rpcError.message };
    }
  } catch (rpcErr: any) {
    if (!rpcErr?.message?.toLowerCase().includes('does not exist')) {
      console.warn('RPC admin_create_user exception, falling back to function:', rpcErr);
    }
  }

  // 2. Coba via Supabase Edge Function
  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('manage-users', {
      body: { action: 'createUser', email, password, nama, role },
    });

    if (!edgeError && edgeData?.success) {
      return { success: true, user: edgeData.user };
    }

    if (edgeError && !edgeError.message?.includes('Failed to send') && !edgeError.message?.includes('404')) {
      return { success: false, error: edgeError.message || 'Gagal mendaftarkan user via Edge Function' };
    }
  } catch (edgeErr: any) {
    console.warn('Edge Function manage-users not available, attempting Cloudflare endpoint:', edgeErr);
  }

  // 3. Coba via Cloudflare Pages Function (/api/manage-users)
  try {
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;

    if (token) {
      const res = await fetch('/api/manage-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'createUser', email, password, nama, role }),
      });

      if (res.ok) {
        const result = await res.json();
        return { success: true, user: result.user };
      }

      if (res.status !== 404) {
        const errorData = await res.json().catch(() => ({}));
        return { success: false, error: errorData.error || `HTTP ${res.status}: Gagal memproses pendaftaran user` };
      }
    }
  } catch (cfErr: any) {
    console.warn('Cloudflare Pages API endpoint unavailable:', cfErr);
  }

  return {
    success: false,
    error: 'Layanan manajemen pengguna belum aktif. Pastikan migrasi 042_admin_user_management telah dijalankan di Supabase atau Edge Function telah dideploy.',
  };
}

/**
 * Menghapus pengguna pengelola sistem secara permanen
 */
export async function deleteSystemUser(userId: string): Promise<{ success: boolean; error?: string }> {
  // 1. Coba via Database RPC
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_delete_user', {
      p_user_id: userId,
    });

    if (!rpcError && rpcData) {
      return { success: true };
    }

    if (rpcError && rpcError.code !== '42883' && !rpcError.message?.toLowerCase().includes('does not exist')) {
      return { success: false, error: rpcError.message };
    }
  } catch (rpcErr: any) {
    if (!rpcErr?.message?.toLowerCase().includes('does not exist')) {
      console.warn('RPC admin_delete_user exception, falling back to function:', rpcErr);
    }
  }

  // 2. Coba via Supabase Edge Function
  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('manage-users', {
      body: { action: 'deleteUser', userId },
    });

    if (!edgeError && edgeData?.success) {
      return { success: true };
    }

    if (edgeError && !edgeError.message?.includes('Failed to send') && !edgeError.message?.includes('404')) {
      return { success: false, error: edgeError.message };
    }
  } catch (edgeErr: any) {
    console.warn('Edge Function manage-users not available:', edgeErr);
  }

  // 3. Coba via Cloudflare Pages Function
  try {
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;

    if (token) {
      const res = await fetch('/api/manage-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'deleteUser', userId }),
      });

      if (res.ok) {
        return { success: true };
      }

      if (res.status !== 404) {
        const errorData = await res.json().catch(() => ({}));
        return { success: false, error: errorData.error || `HTTP ${res.status}: Gagal menghapus user` };
      }
    }
  } catch (cfErr: any) {
    console.warn('Cloudflare Pages API endpoint unavailable:', cfErr);
  }

  return {
    success: false,
    error: 'Layanan penghapusan pengguna belum aktif. Pastikan migrasi 042 telah dijalankan di Supabase.',
  };
}

/**
 * Mengubah hak akses / role pengguna pengelola sistem ('admin' <-> 'operator')
 */
export async function updateSystemUserRole(
  userId: string,
  newRole: 'admin' | 'operator'
): Promise<{ success: boolean; error?: string }> {
  // 1. Coba via Database RPC
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_update_user_role', {
      p_user_id: userId,
      p_role: newRole,
    });

    if (!rpcError && rpcData) {
      return { success: true };
    }

    if (rpcError && rpcError.code !== '42883' && !rpcError.message?.toLowerCase().includes('does not exist')) {
      return { success: false, error: rpcError.message };
    }
  } catch (rpcErr: any) {
    if (!rpcErr?.message?.toLowerCase().includes('does not exist')) {
      console.warn('RPC admin_update_user_role exception, falling back to function:', rpcErr);
    }
  }

  // 2. Coba via Supabase Edge Function
  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('manage-users', {
      body: { action: 'updateRole', userId, newRole },
    });

    if (!edgeError && edgeData?.success) {
      return { success: true };
    }

    if (edgeError && !edgeError.message?.includes('Failed to send') && !edgeError.message?.includes('404')) {
      return { success: false, error: edgeError.message };
    }
  } catch (edgeErr: any) {
    console.warn('Edge Function manage-users not available:', edgeErr);
  }

  // 3. Coba via Cloudflare Pages Function
  try {
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;

    if (token) {
      const res = await fetch('/api/manage-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'updateRole', userId, newRole }),
      });

      if (res.ok) {
        return { success: true };
      }

      if (res.status !== 404) {
        const errorData = await res.json().catch(() => ({}));
        return { success: false, error: errorData.error || `HTTP ${res.status}: Gagal memperbarui role` };
      }
    }
  } catch (cfErr: any) {
    console.warn('Cloudflare Pages API endpoint unavailable:', cfErr);
  }

  return {
    success: false,
    error: 'Layanan perubahan role belum aktif. Pastikan migrasi 042 telah dijalankan di Supabase.',
  };
}

