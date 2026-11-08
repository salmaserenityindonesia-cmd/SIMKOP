import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchMembersSalaryAndAccounts,
  confirmSalaryReconciliation,
  MemberSalaryAccountItem,
} from './salaryImportService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
    },
  };
});

describe('salaryImportService - Paged Fetching & Reconciliation Confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchMembersSalaryAndAccounts', () => {
    it('memuat seluruh anggota dengan paginasi loop (>1.000 anggota) tanpa terpotong di 1.000', async () => {
      // Mock page 1 (1.000 anggota) dan page 2 (300 anggota)
      const page1 = Array.from({ length: 1000 }, (_, i) => ({
        id: `mem-${i + 1}`,
        nrp: `NRP-${i + 1}`,
        nama: `Anggota ${i + 1}`,
        pangkat: 'Serma',
        bank_account_number: `ACC-${i + 1}`,
        take_home_pay: 5000000 + i * 1000,
        master_thp: 5000000 + i * 1000,
        status: 'aktif',
        membership_status: 'ACTIVE',
      }));

      const page2 = Array.from({ length: 300 }, (_, i) => ({
        id: `mem-${1000 + i + 1}`,
        nrp: `NRP-${1000 + i + 1}`,
        nama: `Anggota ${1000 + i + 1}`,
        pangkat: 'Pelda',
        bank_account_number: `ACC-${1000 + i + 1}`,
        take_home_pay: 6000000,
        master_thp: 6000000,
        status: 'aktif',
        membership_status: 'ACTIVE',
      }));

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockImplementation((from: number, to: number) => {
                  if (from === 0) {
                    return Promise.resolve({ data: page1, error: null });
                  }
                  if (from === 1000) {
                    return Promise.resolve({ data: page2, error: null });
                  }
                  return Promise.resolve({ data: [], error: null });
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await fetchMembersSalaryAndAccounts();
      expect(result).toHaveLength(1300);
      expect(result[0].nrp).toBe('NRP-1');
      expect(result[1299].nrp).toBe('NRP-1300');
    });

    it('memuat data dalam 1 batch jika jumlah data kurang dari 1.000', async () => {
      const sampleData: MemberSalaryAccountItem[] = [
        {
          id: 'mem-1',
          nrp: '111111',
          nama: 'Budi Santoso',
          pangkat: 'Koptu',
          bank_account_number: '1234567890',
          take_home_pay: 4500000,
          master_thp: 4500000,
          status: 'aktif',
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: sampleData, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await fetchMembersSalaryAndAccounts();
      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe('Budi Santoso');
    });

    it('mengembalikan array kosong jika tabel kosong', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await fetchMembersSalaryAndAccounts();
      expect(result).toEqual([]);
    });

    it('menangani fallback error (tabel belum ada 42P01 / network) dengan mengembalikan array kosong', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: '42P01', message: 'relation "anggota" does not exist' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await fetchMembersSalaryAndAccounts();
      expect(result).toEqual([]);
    });

    it('melempar error jika terjadi database error fatal non-fallback', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: '23505', message: 'Unique violation' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(fetchMembersSalaryAndAccounts()).rejects.toThrow(
        /Gagal mengambil data gaji dan rekening anggota/
      );
    });
  });

  describe('confirmSalaryReconciliation', () => {
    it('memanggil rpc batch_update_salary_reconciliation dengan payload dan user id admin', async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: 'admin-uuid-123' } },
      });
      (supabase.rpc as any).mockResolvedValue({ error: null });

      const payload = [
        {
          nrp: '123456',
          take_home_pay: 5000000,
          final_account_number: '987654321',
        },
      ];

      const success = await confirmSalaryReconciliation(payload);
      expect(success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('batch_update_salary_reconciliation', {
        payload,
        admin_id: 'admin-uuid-123',
      });
    });

    it('melempar error jika rpc mengembalikan error', async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: null },
      });
      (supabase.rpc as any).mockResolvedValue({
        error: new Error('RPC execution failed'),
      });

      await expect(confirmSalaryReconciliation([])).rejects.toThrow('RPC execution failed');
    });
  });
});
