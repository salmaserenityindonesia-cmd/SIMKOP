import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSystemUser,
  deactivateSystemUser,
  deleteSystemUser,
  getPengelolaWithEmails,
  getUserActivitySummaryMap,
  reactivateSystemUser,
  resetSystemUserPassword,
  updateSystemUserRole,
} from './userService';
import { supabase } from '../lib/supabaseClient';
import { getPengelolaList } from './koperasiService';
import { reassignTasksFromInactiveOperators } from './stockOpnameService';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('./koperasiService', () => ({
  getPengelolaList: vi.fn(),
}));

vi.mock('./stockOpnameService', () => ({
  reassignTasksFromInactiveOperators: vi.fn(),
}));

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock global fetch
    globalThis.fetch = vi.fn();
  });

  describe('createSystemUser', () => {
    it('berhasil membuat user melalui Database RPC admin_create_user', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { id: 'u-1', email: 'staff@koperasi.com', nama: 'Staff Baru', role: 'operator' },
        error: null,
      } as any);

      const result = await createSystemUser({
        email: 'staff@koperasi.com',
        password: 'password123',
        nama: 'Staff Baru',
        role: 'operator',
      });

      expect(supabase.rpc).toHaveBeenCalledWith('admin_create_user', {
        p_email: 'staff@koperasi.com',
        p_password: 'password123',
        p_nama: 'Staff Baru',
        p_role: 'operator',
      });
      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('u-1');
    });

    it('fallback ke Supabase Edge Function jika RPC tidak ditemukan (code 42883)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function admin_create_user does not exist' },
      } as any);

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, user: { id: 'u-2', email: 'edge@koperasi.com' } },
        error: null,
      } as any);

      const result = await createSystemUser({
        email: 'edge@koperasi.com',
        password: 'password123',
        nama: 'Edge User',
        role: 'admin',
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('manage-users', {
        body: {
          action: 'createUser',
          email: 'edge@koperasi.com',
          password: 'password123',
          nama: 'Edge User',
          role: 'admin',
        },
      });
      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('u-2');
    });

    it('fallback ke Cloudflare Pages Function jika RPC dan Edge Function tidak tersedia', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      } as any);

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: { message: '404 Not Found' },
      } as any);

      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'fake-jwt-token' } as any },
        error: null,
      });

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, user: { id: 'u-3', email: 'cf@koperasi.com' } }),
      });

      const result = await createSystemUser({
        email: 'cf@koperasi.com',
        password: 'password123',
        nama: 'CF User',
        role: 'operator',
      });

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/manage-users', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer fake-jwt-token',
        }),
      }));
      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('u-3');
    });

    it('mengembalikan error jika validasi RPC gagal (misal email duplikat)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'Email sudah terdaftar di sistem.' },
      } as any);

      const result = await createSystemUser({
        email: 'existing@koperasi.com',
        password: 'password123',
        nama: 'Existing User',
        role: 'operator',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email sudah terdaftar di sistem.');
    });
  });

  describe('deleteSystemUser', () => {
    it('berhasil menghapus user melalui Database RPC admin_delete_user', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as any);

      const result = await deleteSystemUser('target-user-id');

      expect(supabase.rpc).toHaveBeenCalledWith('admin_delete_user', {
        p_user_id: 'target-user-id',
      });
      expect(result.success).toBe(true);
    });

    it('mengembalikan error jika admin mencoba menghapus dirinya sendiri', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'Tidak dapat menghapus akun admin yang sedang Anda gunakan.' },
      } as any);

      const result = await deleteSystemUser('self-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tidak dapat menghapus akun admin');
    });
  });

  describe('updateSystemUserRole', () => {
    it('berhasil memperbarui role melalui Database RPC admin_update_user_role', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as any);

      const result = await updateSystemUserRole('user-1', 'admin');

      expect(supabase.rpc).toHaveBeenCalledWith('admin_update_user_role', {
        p_user_id: 'user-1',
        p_role: 'admin',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('deactivateSystemUser', () => {
    it('menonaktifkan user via admin_deactivate_user RPC dan memicu handover tugas opname', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { id: 'op-1', is_active: false },
        error: null,
      } as any);
      vi.mocked(reassignTasksFromInactiveOperators).mockResolvedValueOnce({
        reassignedCount: 3,
        returnedToQueueCount: 0,
      });

      const result = await deactivateSystemUser('op-1', 'Resign');

      expect(supabase.rpc).toHaveBeenCalledWith('admin_deactivate_user', {
        p_user_id: 'op-1',
        p_reason: 'Resign',
      });
      expect(reassignTasksFromInactiveOperators).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        success: true,
        reassignedCount: 3,
        returnedToQueueCount: 0,
      });
    });
  });

  describe('reactivateSystemUser', () => {
    it('mengaktifkan kembali user via admin_reactivate_user RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { id: 'op-1', is_active: true },
        error: null,
      } as any);

      const result = await reactivateSystemUser('op-1');

      expect(supabase.rpc).toHaveBeenCalledWith('admin_reactivate_user', {
        p_user_id: 'op-1',
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('getUserActivitySummaryMap', () => {
    it('memetakan hasil admin_get_user_activity_counts RPC beserta flag hasHistory', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          { user_id: 'u-hist', sales_count: 2, shifts_count: 1, opname_tasks_count: 0 },
          { user_id: 'u-clean', sales_count: 0, shifts_count: 0, opname_tasks_count: 0 },
        ],
        error: null,
      } as any);

      const map = await getUserActivitySummaryMap();

      expect(map['u-hist']).toEqual({
        salesCount: 2,
        shiftsCount: 1,
        opnameTasksCount: 0,
        hasHistory: true,
      });
      expect(map['u-clean']).toEqual({
        salesCount: 0,
        shiftsCount: 0,
        opnameTasksCount: 0,
        hasHistory: false,
      });
    });
  });

  describe('getPengelolaWithEmails', () => {
    it('mengambil daftar pengelola beserta alamat email lengkap melalui RPC get_pengelola_with_emails', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          { id: 'u-1', nama: 'Kasir', email: 'kasir@simkop.pages.dev', role: 'operator', is_active: true },
          { id: 'u-2', nama: 'kasir 2', email: 'kasir2@gmail.com', role: 'operator', is_active: true },
        ],
        error: null,
      } as any);

      const list = await getPengelolaWithEmails();

      expect(supabase.rpc).toHaveBeenCalledWith('get_pengelola_with_emails');
      expect(list).toHaveLength(2);
      expect(list[0].email).toBe('kasir@simkop.pages.dev');
      expect(list[1].email).toBe('kasir2@gmail.com');
    });

    it('fallback ke getPengelolaList jika RPC get_pengelola_with_emails belum tersedia', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function get_pengelola_with_emails does not exist' },
      } as any);
      vi.mocked(getPengelolaList).mockResolvedValueOnce({
        data: [{ id: 'u-1', nama: 'Kasir', role: 'operator' }],
        count: 1,
      });

      const list = await getPengelolaWithEmails();

      expect(getPengelolaList).toHaveBeenCalledWith(500, 0);
      expect(list).toEqual([{ id: 'u-1', nama: 'Kasir', role: 'operator' }]);
    });
  });

  describe('resetSystemUserPassword', () => {
    it('berhasil mereset password melalui RPC admin_reset_user_password', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true, message: 'Kata sandi untuk Kasir berhasil diperbarui.' },
        error: null,
      } as any);

      const res = await resetSystemUserPassword('u-kasir', '  Kasir#1234  ');

      expect(supabase.rpc).toHaveBeenCalledWith('admin_reset_user_password', {
        p_target_user_id: 'u-kasir',
        p_new_password: 'Kasir#1234',
      });
      expect(res).toEqual({
        success: true,
        message: 'Kata sandi untuk Kasir berhasil diperbarui.',
      });
    });

    it('menolak password kurang dari 6 karakter sebelum memanggil RPC', async () => {
      const res = await resetSystemUserPassword('u-kasir', '12345');

      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(res.success).toBe(false);
      expect(res.error).toContain('minimal harus terdiri dari 6 karakter');
    });

    it('mengembalikan pesan error jika RPC mengembalikan error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Akses ditolak: Hanya Admin yang dapat mengganti kata sandi pengguna.' },
      } as any);

      const res = await resetSystemUserPassword('u-kasir', 'Kasir#1234');

      expect(res.success).toBe(false);
      expect(res.error).toContain('Akses ditolak');
    });
  });
});
