import { supabase } from '../lib/supabaseClient';
import { fetchAllPaginatedSafe } from '../utils/supabasePagination';
import { getPengelolaList, type Pengelola } from './koperasiService';
import { reassignTasksFromInactiveOperators } from './stockOpnameService';

export interface CreateUserData {
  email: string;
  password: string;
  nama: string;
  role: 'admin' | 'operator';
}

export interface UserActivitySummary {
  salesCount: number;
  shiftsCount: number;
  opnameTasksCount: number;
  hasHistory: boolean;
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

/**
 * Mengambil ringkasan jumlah transaksi POS, shift kasir, dan stock opname per pengelola
 * untuk menentukan apakah akun aman dihapus permanen atau wajib soft-deactivation.
 */
export async function getUserActivitySummaryMap(): Promise<Record<string, UserActivitySummary>> {
  const summary: Record<string, UserActivitySummary> = {};

  const ensureEntry = (userId: string): UserActivitySummary => {
    if (!summary[userId]) {
      summary[userId] = {
        salesCount: 0,
        shiftsCount: 0,
        opnameTasksCount: 0,
        hasHistory: false,
      };
    }
    return summary[userId];
  };

  try {
    if (typeof supabase.rpc === 'function') {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_user_activity_counts');
      if (!rpcError && Array.isArray(rpcData)) {
        for (const row of rpcData) {
          const uid = String(row.user_id || '');
          if (!uid) continue;
          const salesCount = Number(row.sales_count || 0);
          const shiftsCount = Number(row.shifts_count || 0);
          const opnameTasksCount = Number(row.opname_tasks_count || 0);
          summary[uid] = {
            salesCount,
            shiftsCount,
            opnameTasksCount,
            hasHistory: salesCount + shiftsCount + opnameTasksCount > 0,
          };
        }
        return summary;
      }
    }
  } catch {
    // Fallback to direct table scans
  }

  try {
    const [salesRes, shiftsRes, tasksRes] = await Promise.all([
      fetchAllPaginatedSafe<any>(() => supabase.from('sales').select('cashier_id')),
      fetchAllPaginatedSafe<any>(() => supabase.from('cashier_shifts').select('cashier_id')),
      fetchAllPaginatedSafe<any>(() =>
        supabase
          .from('stock_opname_tasks')
          .select('assigned_operator_id, recount_operator_id, reassigned_from_operator_id')
      ),
    ]);

    for (const s of salesRes.data || []) {
      if (s.cashier_id) {
        const entry = ensureEntry(String(s.cashier_id));
        entry.salesCount += 1;
        entry.hasHistory = true;
      }
    }

    for (const sh of shiftsRes.data || []) {
      if (sh.cashier_id) {
        const entry = ensureEntry(String(sh.cashier_id));
        entry.shiftsCount += 1;
        entry.hasHistory = true;
      }
    }

    for (const t of tasksRes.data || []) {
      const ids = new Set<string>();
      if (t.assigned_operator_id) ids.add(String(t.assigned_operator_id));
      if (t.recount_operator_id) ids.add(String(t.recount_operator_id));
      if (t.reassigned_from_operator_id) ids.add(String(t.reassigned_from_operator_id));
      for (const id of ids) {
        const entry = ensureEntry(id);
        entry.opnameTasksCount += 1;
        entry.hasHistory = true;
      }
    }
  } catch (err) {
    console.warn('Gagal memuat ringkasan aktivitas pengelola:', err);
  }

  return summary;
}

/**
 * Menonaktifkan akun staf (soft-deactivation), mencabut seluruh akses fitur POS/Opname,
 * dan langsung mengalihkan tugas opname terbuka ke operator aktif.
 */
export async function deactivateSystemUser(
  userId: string,
  reason: string
): Promise<{
  success: boolean;
  reassignedCount?: number;
  returnedToQueueCount?: number;
  error?: string;
}> {
  const cleanReason = reason.trim();
  let deactivated = false;

  try {
    if (typeof supabase.rpc === 'function') {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_deactivate_user', {
        p_user_id: userId,
        p_reason: cleanReason || null,
      });

      if (!rpcError && rpcData) {
        deactivated = true;
      } else if (
        rpcError &&
        rpcError.code !== '42883' &&
        !rpcError.message?.toLowerCase().includes('does not exist')
      ) {
        return { success: false, error: rpcError.message };
      }
    }
  } catch (rpcErr: any) {
    if (!rpcErr?.message?.toLowerCase().includes('does not exist')) {
      return { success: false, error: rpcErr?.message || 'Gagal menonaktifkan user' };
    }
  }

  if (!deactivated) {
    const { error: updErr } = await supabase
      .from('pengelola')
      .update({
        is_active: false,
        can_access_pos: false,
        can_access_opname: false,
        opname_only_login: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: cleanReason || null,
      })
      .eq('id', userId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }
  }

  let reassignedCount = 0;
  let returnedToQueueCount = 0;
  try {
    const handover = await reassignTasksFromInactiveOperators();
    reassignedCount = handover.reassignedCount;
    returnedToQueueCount = handover.returnedToQueueCount;
  } catch (handoverErr) {
    console.warn('Auto-handover tugas opname pasca penonaktifan gagal:', handoverErr);
  }

  return { success: true, reassignedCount, returnedToQueueCount };
}

/**
 * Mengaktifkan kembali akun staf yang sebelumnya dinonaktifkan.
 */
export async function reactivateSystemUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof supabase.rpc === 'function') {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_reactivate_user', {
        p_user_id: userId,
      });

      if (!rpcError && rpcData) {
        return { success: true };
      }

      if (
        rpcError &&
        rpcError.code !== '42883' &&
        !rpcError.message?.toLowerCase().includes('does not exist')
      ) {
        return { success: false, error: rpcError.message };
      }
    }
  } catch (rpcErr: any) {
    if (!rpcErr?.message?.toLowerCase().includes('does not exist')) {
      return { success: false, error: rpcErr?.message || 'Gagal mengaktifkan kembali user' };
    }
  }

  const { error: updErr } = await supabase
    .from('pengelola')
    .update({
      is_active: true,
      can_access_pos: true,
      can_access_opname: true,
      opname_only_login: false,
      deactivated_at: null,
      deactivation_reason: null,
    })
    .eq('id', userId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  return { success: true };
}

/**
 * Mengambil daftar pengelola beserta alamat email login lengkap dari auth.users
 * melalui RPC SECURITY DEFINER `get_pengelola_with_emails` (dengan fallback ke `getPengelolaList`).
 */
export async function getPengelolaWithEmails(): Promise<Pengelola[]> {
  try {
    if (typeof supabase.rpc === 'function') {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_pengelola_with_emails');
      if (!rpcError && Array.isArray(rpcData)) {
        return rpcData as Pengelola[];
      }
      if (rpcError) {
        console.warn('RPC get_pengelola_with_emails fallback ke query pengelola:', rpcError.message);
      }
    }
  } catch (err) {
    console.warn('Exception RPC get_pengelola_with_emails, fallback ke query pengelola:', err);
  }

  const { data } = await getPengelolaList(500, 0);
  return data;
}

/**
 * Mengganti / mereset kata sandi akun pengguna sistem (kasir/operator/admin) oleh Admin aktif
 * melalui RPC SECURITY DEFINER `admin_reset_user_password`.
 */
export async function resetSystemUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const cleanPassword = newPassword.trim();
  if (cleanPassword.length < 6) {
    return {
      success: false,
      error: 'Kata sandi baru minimal harus terdiri dari 6 karakter.',
    };
  }

  try {
    const { data, error } = await supabase.rpc('admin_reset_user_password', {
      p_target_user_id: userId,
      p_new_password: cleanPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      message: (data as any)?.message || 'Kata sandi berhasil diperbarui.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal mengganti kata sandi pengguna.',
    };
  }
}


