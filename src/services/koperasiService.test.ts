import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  importMembersChunked,
  fetchAllAnggotaPaged,
  getAnggota,
  MemberImportInput,
} from './koperasiService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe('koperasiService - Chunked Import & Paged Fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchAllAnggotaPaged', () => {
    it('harus memuat seluruh anggota dengan paginasi loop (>1.000 anggota) tanpa terpotong di 1.000', async () => {
      // Mock page 1 (1.000 baris) dan page 2 (250 baris)
      const page1 = Array.from({ length: 1000 }, (_, i) => ({
        id: `member-${i + 1}`,
        nrp: `NRP-${i + 1}`,
        nama: `Anggota ${i + 1}`,
      }));
      const page2 = Array.from({ length: 250 }, (_, i) => ({
        id: `member-${1000 + i + 1}`,
        nrp: `NRP-${1000 + i + 1}`,
        nama: `Anggota ${1000 + i + 1}`,
      }));

      const mockFrom = vi.fn();
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

      const allMembers = await fetchAllAnggotaPaged();
      expect(allMembers).toHaveLength(1250);
      expect(allMembers[0].nrp).toBe('NRP-1');
      expect(allMembers[1249].nrp).toBe('NRP-1250');
    });

    it('getAnggota harus mendelegasikan ke fetchAllAnggotaPaged', async () => {
      const dummyData = [{ id: 'm-1', nrp: '101', nama: 'Test' }];
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: dummyData, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await getAnggota();
      expect(result).toEqual(dummyData);
    });
  });

  describe('importMembersChunked', () => {
    it('harus membagi 250 data anggota menjadi 3 chunk (100, 100, 50) dengan auto-provisioning dan onProgress callback', async () => {
      const mockDepositTypes = [
        { id: 'dt-sp', code: 'SP', name: 'Simpanan Pokok' },
        { id: 'dt-sw', code: 'SW', name: 'Simpanan Wajib' },
        { id: 'dt-sb', code: 'SB', name: 'Simpanan Belanja' },
        { id: 'dt-sl', code: 'SL', name: 'Simpanan Lebaran' },
      ];

      const upsertBatches: any[][] = [];
      const memberDepositsInserts: any[][] = [];
      const transactionInserts: any[][] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockDepositTypes, error: null }),
          };
        }

        if (table === 'anggota') {
          return {
            upsert: vi.fn().mockImplementation((payload: any[]) => {
              upsertBatches.push(payload);
              return Promise.resolve({ error: null });
            }),
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((col: string, nrpList: string[]) => {
                const members = nrpList.map((nrp, idx) => ({
                  id: `uuid-${nrp}`,
                  nrp,
                  created_at: '2023-01-01T00:00:00.000Z',
                }));
                return Promise.resolve({ data: members, error: null });
              }),
            }),
          };
        }

        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((col: string, ids: string[]) => {
                // Simulasi rekening yang sudah terbentuk
                const deps = ids.flatMap((id) =>
                  mockDepositTypes.map((dt) => ({
                    id: `md-${id}-${dt.code}`,
                    member_id: id,
                    deposit_type_id: dt.id,
                  }))
                );
                return Promise.resolve({ data: deps, error: null });
              }),
            }),
            insert: vi.fn().mockImplementation((payload: any[]) => {
              memberDepositsInserts.push(payload);
              return Promise.resolve({ error: null });
            }),
          };
        }

        if (table === 'deposit_transactions') {
          return {
            insert: vi.fn().mockImplementation((payload: any[]) => {
              transactionInserts.push(payload);
              return Promise.resolve({ error: null });
            }),
          };
        }

        return {};
      });

      // Siapkan 250 dummy anggota
      const dummy250: MemberImportInput[] = Array.from({ length: 250 }, (_, i) => ({
        nrp: `NRP-${i + 1}`,
        nama: `Anggota Massal ${i + 1}`,
        pangkat: 'Bripka',
        bank_account_number: `112233${i + 1}`,
        status: 'aktif',
        membership_status: 'ACTIVE',
        jumlah_simpanan_pokok: 100000,
        jumlah_simpanan_wajib: 50000,
        jumlah_simpanan_belanja: 0,
        jumlah_simpanan_lebaran: 0,
      }));

      const progressHistory: { current: number; total: number }[] = [];
      const onProgress = vi.fn((current, total) => {
        progressHistory.push({ current, total });
      });

      const result = await importMembersChunked(dummy250, onProgress);

      // Verifikasi pembagian chunk
      expect(result.totalProcessed).toBe(250);
      expect(result.successCount).toBe(250);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);

      // 250 data / 100 = 3 batch: 100, 100, 50
      expect(upsertBatches).toHaveLength(3);
      expect(upsertBatches[0]).toHaveLength(100);
      expect(upsertBatches[1]).toHaveLength(100);
      expect(upsertBatches[2]).toHaveLength(50);

      // Verifikasi onProgress dipanggil 3 kali bertahap
      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(progressHistory).toEqual([
        { current: 100, total: 250 },
        { current: 200, total: 250 },
        { current: 250, total: 250 },
      ]);

      // Verifikasi deposit_transactions diinsert
      expect(transactionInserts.length).toBeGreaterThan(0);
    });

    it('harus menangani kasus array input kosong dengan anggun', async () => {
      const result = await importMembersChunked([]);
      expect(result).toEqual({
        totalProcessed: 0,
        successCount: 0,
        failedCount: 0,
        errors: [],
      });
    });
  });
});

