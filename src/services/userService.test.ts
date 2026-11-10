import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSystemUser, deleteSystemUser, updateSystemUserRole } from './userService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn(),
    },
  },
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
});
