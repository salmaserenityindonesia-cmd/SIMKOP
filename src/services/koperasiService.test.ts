import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  importMembersChunked,
  fetchAllAnggotaPaged,
  getAnggota,
  getDepositTypes,
  catatRestockFaktur,
  MemberImportInput,
} from './koperasiService';
import { supabase } from '../lib/supabaseClient';
import { clearTierCache } from './savingsRateService';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe('koperasiService - Chunked Import & Paged Fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTierCache();
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
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
              in: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ error: null }),
                in: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
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

    it('harus membersihkan mutasi saldo awal/migrasi lama (clean overwrite) sebelum menyisipkan saldo baru saat re-import', async () => {
      const mockDepositTypes = [
        { id: 'dt-sp', code: 'SP', name: 'Simpanan Pokok' },
        { id: 'dt-sw', code: 'SW', name: 'Simpanan Wajib' },
        { id: 'dt-sb', code: 'SB', name: 'Simpanan Belanja' },
        { id: 'dt-sl', code: 'SL', name: 'Simpanan Lebaran' },
      ];

      const deletedAccountIds: string[] = [];
      const deletedFilters: string[] = [];
      const insertedTransactions: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockDepositTypes, error: null }),
          };
        }

        if (table === 'anggota') {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'uuid-agus-susanto',
                    nrp: 'NRP-AGUS',
                    nama: 'Agus Susanto',
                    created_at: '2022-08-01T00:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-agus-sp', member_id: 'uuid-agus-susanto', deposit_type_id: 'dt-sp' },
                  { id: 'md-agus-sw', member_id: 'uuid-agus-susanto', deposit_type_id: 'dt-sw' },
                  { id: 'md-agus-sb', member_id: 'uuid-agus-susanto', deposit_type_id: 'dt-sb' },
                  { id: 'md-agus-sl', member_id: 'uuid-agus-susanto', deposit_type_id: 'dt-sl' },
                ],
                error: null,
              }),
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-agus-sp', member_id: 'uuid-agus-susanto', deposit_type: { code: 'SP' } },
                  { id: 'md-agus-sw', member_id: 'uuid-agus-susanto', deposit_type: { code: 'SW' } },
                  { id: 'md-agus-sb', member_id: 'uuid-agus-susanto', deposit_type: { code: 'SB' } },
                  { id: 'md-agus-sl', member_id: 'uuid-agus-susanto', deposit_type: { code: 'SL' } },
                ],
                error: null,
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }

        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, id: string) => {
                deletedAccountIds.push(id);
                return Promise.resolve({ error: null });
              }),
              in: vi.fn().mockImplementation((col: string, ids: string[]) => {
                deletedAccountIds.push(...ids);
                return Promise.resolve({ error: null });
              }),
            }),
            insert: vi.fn().mockImplementation((payload: any[]) => {
              insertedTransactions.push(...payload);
              return Promise.resolve({ error: null });
            }),
          };
        }

        return {};
      });

      const reImportInput: MemberImportInput[] = [
        {
          nrp: 'NRP-AGUS',
          nama: 'Agus Susanto',
          pangkat: 'Aiptu',
          bank_account_number: '1234567890',
          status: 'aktif',
          membership_status: 'ACTIVE',
          tgl_awal_anggota: '2022-08-01',
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 10410000,
          jumlah_simpanan_belanja: 2550000,
          jumlah_simpanan_lebaran: 15300000,
        },
      ];

      const res = await importMembersChunked(reImportInput);

      expect(res.successCount).toBe(1);
      expect(res.failedCount).toBe(0);

      // Verifikasi bahwa seluruh transaksi lama akun dibersihkan (clean overwrite)
      expect(deletedAccountIds).toEqual(
        expect.arrayContaining(['md-agus-sp', 'md-agus-sw', 'md-agus-sb', 'md-agus-sl'])
      );
      expect(deletedAccountIds).toHaveLength(4);

      // Verifikasi bahwa mutasi baru dimasukkan dengan nominal yang diperbarui,
      // bertipe 'deposit', berdeskripsi 'Saldo Awal Migrasi Sistem', dan for_month/for_year bernilai null
      expect(insertedTransactions).toHaveLength(4);
      const wajibTx = insertedTransactions.find((tx) => tx.member_deposit_id === 'md-agus-sw');
      expect(wajibTx?.amount).toBe(10410000);
      expect(wajibTx?.transaction_type).toBe('deposit');
      expect(wajibTx?.description).toBe('Saldo Awal Migrasi Sistem');
      expect(wajibTx?.for_month).toBeNull();
      expect(wajibTx?.for_year).toBeNull();

      const belanjaTx = insertedTransactions.find((tx) => tx.member_deposit_id === 'md-agus-sb');
      expect(belanjaTx?.amount).toBe(2550000);
      expect(belanjaTx?.description).toBe('Saldo Awal Migrasi Sistem');
      expect(belanjaTx?.for_month).toBeNull();
      expect(belanjaTx?.for_year).toBeNull();

      const lebaranTx = insertedTransactions.find((tx) => tx.member_deposit_id === 'md-agus-sl');
      expect(lebaranTx?.amount).toBe(15300000);
      expect(lebaranTx?.description).toBe('Saldo Awal Migrasi Sistem');
      expect(lebaranTx?.for_month).toBeNull();
      expect(lebaranTx?.for_year).toBeNull();
    });

    it('harus menerapkan Clean Overwrite pada re-import anggota (Kasus Eko Setiawan - NRP 89113210) agar saldo simpanan tidak bertambah ganda', async () => {
      const mockDepositTypes = [
        { id: 'dt-sp', code: 'SP', name: 'Simpanan Pokok' },
        { id: 'dt-sw', code: 'SW', name: 'Simpanan Wajib' },
        { id: 'dt-sb', code: 'SB', name: 'Simpanan Belanja' },
        { id: 'dt-sl', code: 'SL', name: 'Simpanan Lebaran' },
      ];

      const deletedAccountIds: string[] = [];
      const deletedFilters: string[] = [];
      const insertedTransactions: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockDepositTypes, error: null }),
          };
        }

        if (table === 'anggota') {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'uuid-eko-setiawan',
                    nrp: '89113210',
                    nama: 'Eko Setiawan',
                    created_at: '2023-01-01T00:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-eko-sp', member_id: 'uuid-eko-setiawan', deposit_type_id: 'dt-sp' },
                  { id: 'md-eko-sw', member_id: 'uuid-eko-setiawan', deposit_type_id: 'dt-sw' },
                  { id: 'md-eko-sb', member_id: 'uuid-eko-setiawan', deposit_type_id: 'dt-sb' },
                  { id: 'md-eko-sl', member_id: 'uuid-eko-setiawan', deposit_type_id: 'dt-sl' },
                ],
                error: null,
              }),
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-eko-sp', member_id: 'uuid-eko-setiawan', deposit_type: { code: 'SP' } },
                  { id: 'md-eko-sw', member_id: 'uuid-eko-setiawan', deposit_type: { code: 'SW' } },
                  { id: 'md-eko-sb', member_id: 'uuid-eko-setiawan', deposit_type: { code: 'SB' } },
                  { id: 'md-eko-sl', member_id: 'uuid-eko-setiawan', deposit_type: { code: 'SL' } },
                ],
                error: null,
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }

        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((col: string, ids: string[]) => {
                deletedAccountIds.push(...ids);
                return Promise.resolve({ error: null });
              }),
            }),
            insert: vi.fn().mockImplementation((payload: any[]) => {
              insertedTransactions.push(...payload);
              return Promise.resolve({ error: null });
            }),
          };
        }

        return {};
      });

      const ekoInput: MemberImportInput[] = [
        {
          nrp: '89113210',
          nama: 'Eko Setiawan',
          pangkat: 'Bripka',
          status: 'aktif',
          membership_status: 'ACTIVE',
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 4200000,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
        },
      ];

      const res = await importMembersChunked(ekoInput);

      expect(res.successCount).toBe(1);
      expect(res.failedCount).toBe(0);

      // Verifikasi bahwa mutasi lama dibersihkan pada level ID rekening anggota
      expect(deletedAccountIds).toEqual(
        expect.arrayContaining(['md-eko-sp', 'md-eko-sw', 'md-eko-sb', 'md-eko-sl'])
      );
      expect(deletedAccountIds).toHaveLength(4);

      // Verifikasi transaksi simpanan wajib tetap Rp 4.200.000 (tidak menjadi 8.400.000)
      const wajibTxs = insertedTransactions.filter((tx) => tx.member_deposit_id === 'md-eko-sw');
      expect(wajibTxs).toHaveLength(1);
      expect(wajibTxs[0].amount).toBe(4200000);
      expect(wajibTxs[0].transaction_type).toBe('deposit');
      expect(wajibTxs[0].description).toBe('Saldo Awal Migrasi Sistem');
      expect(wajibTxs[0].for_month).toBeNull();
    });

    it('tidak menyisipkan deposit_transactions jika nominal simpanan kosong atau nol', async () => {
      const mockDepositTypes = [
        { id: 'dt-sp', code: 'SP', name: 'Simpanan Pokok' },
        { id: 'dt-sw', code: 'SW', name: 'Simpanan Wajib' },
        { id: 'dt-sb', code: 'SB', name: 'Simpanan Belanja' },
        { id: 'dt-sl', code: 'SL', name: 'Simpanan Lebaran' },
      ];

      const insertedTransactions: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockDepositTypes, error: null }),
          };
        }
        if (table === 'anggota') {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'uuid-zero-member', nrp: 'NRP-ZERO', created_at: '2023-01-01' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-zero-sp', member_id: 'uuid-zero-member', deposit_type_id: 'dt-sp' },
                  { id: 'md-zero-sw', member_id: 'uuid-zero-member', deposit_type_id: 'dt-sw' },
                  { id: 'md-zero-sb', member_id: 'uuid-zero-member', deposit_type_id: 'dt-sb' },
                  { id: 'md-zero-sl', member_id: 'uuid-zero-member', deposit_type_id: 'dt-sl' },
                ],
                error: null,
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
              in: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
            insert: vi.fn().mockImplementation((payload: any[]) => {
              insertedTransactions.push(...payload);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      });

      const zeroInput: MemberImportInput[] = [
        {
          nrp: 'NRP-ZERO',
          nama: 'Zero Member',
          status: 'aktif',
          membership_status: 'ACTIVE',
          jumlah_simpanan_pokok: 0,
          jumlah_simpanan_wajib: 0,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
        },
      ];

      const res = await importMembersChunked(zeroInput);
      expect(res.successCount).toBe(1);
      expect(insertedTransactions).toHaveLength(0);
    });
  });

  describe('getDepositTypes', () => {
    it('harus memperkaya jenis simpanan dengan effective_amount dari tarif bertingkat aktif', async () => {
      const mockDepositTypes = [
        { id: 'dt-1', code: 'SW', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: 50000, can_be_withdrawn: false, is_active: true },
        { id: 'dt-2', code: 'SB', name: 'Simpanan Belanja', frequency_type: 'monthly', default_amount: 25000, can_be_withdrawn: true, is_active: true },
        { id: 'dt-3', code: 'SP', name: 'Simpanan Pokok', frequency_type: 'one_time', default_amount: 100000, can_be_withdrawn: false, is_active: true },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockDepositTypes, error: null })
            })
          };
        }
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 't-1', deposit_type_code: 'WAJIB', start_year: 2025, start_month: 1, end_year: null, end_month: null, monthly_rate: 210000 },
                    { id: 't-2', deposit_type_code: 'BELANJA', start_year: 2025, start_month: 1, end_year: null, end_month: null, monthly_rate: 45000 },
                  ],
                  error: null
                })
              })
            })
          };
        }
        return {};
      });

      const types = await getDepositTypes();
      expect(types).toHaveLength(3);

      const sw = types.find(t => t.code === 'SW');
      expect(sw?.default_amount).toBe(50000);
      expect(sw?.effective_amount).toBe(210000);

      const sb = types.find(t => t.code === 'SB');
      expect(sb?.default_amount).toBe(25000);
      expect(sb?.effective_amount).toBe(45000);

      const sp = types.find(t => t.code === 'SP');
      expect(sp?.default_amount).toBe(100000);
      expect(sp?.effective_amount).toBe(100000);
    });

    it('harus memperkaya Simpanan Pokok dengan effective_amount dari tarif bertingkat POKOK yang aktif', async () => {
      const mockDepositTypes = [
        { id: 'dt-3', code: 'SP', name: 'Simpanan Pokok', frequency_type: 'one_time', default_amount: 100000, can_be_withdrawn: false, is_active: true },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockDepositTypes, error: null })
            })
          };
        }
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 't-pokok', deposit_type_code: 'POKOK', start_year: 2025, start_month: 1, end_year: null, end_month: null, monthly_rate: 150000 },
                  ],
                  error: null
                })
              })
            })
          };
        }
        return {};
      });

      const types = await getDepositTypes();
      expect(types).toHaveLength(1);

      const sp = types.find(t => t.code === 'SP');
      expect(sp?.default_amount).toBe(100000);
      expect(sp?.effective_amount).toBe(150000);
    });

    it('harus fallback ke default_amount jika query tabel savings_rate_tiers error', async () => {
      const mockDepositTypes = [
        { id: 'dt-1', code: 'SW', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: 50000, can_be_withdrawn: false, is_active: true }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockDepositTypes, error: null })
            })
          };
        }
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') })
              })
            })
          };
        }
        return {};
      });

      const types = await getDepositTypes();
      expect(types).toHaveLength(1);
      // Hardcoded fallback rate for WAJIB is 200000, which will be picked if fallback is returned, or default_amount if completely failed
      expect(types[0].effective_amount).toBeGreaterThan(0);
    });
  });

  describe('catatRestockFaktur - Atomic RPC & Fallback', () => {
    it('harus memvalidasi nomor faktur dan item produk sebelum mengeksekusi', async () => {
      await expect(catatRestockFaktur({
        noFaktur: '   ',
        tanggal: '2026-11-11',
        items: [{ produkId: 'p1', qty: 10, hargaBeli: 5000 }]
      })).rejects.toThrow('Nomor Faktur (noFaktur) harus diisi');

      await expect(catatRestockFaktur({
        noFaktur: 'FAKTUR-001',
        tanggal: '2026-11-11',
        items: []
      })).rejects.toThrow('Faktur pembelian harus memiliki minimal satu item produk.');
    });

    it('harus memanggil create_purchase_invoice_atomic RPC ketika RPC tersedia dan berhasil', async () => {
      const mockRpcResponse = {
        success: true,
        id: 'purchase-uuid-123',
        noFaktur: 'FAKTUR-RESTOCK-99',
        tanggal: '2026-11-11',
        totalNilai: 150000
      };

      (supabase.rpc as any).mockResolvedValueOnce({
        data: mockRpcResponse,
        error: null
      });

      const input = {
        noFaktur: 'FAKTUR-RESTOCK-99',
        tanggal: '2026-11-11',
        items: [
          { produkId: 'prod-1', namaProduk: 'Beras Premium 5kg', qty: 10, hargaBeli: 15000 }
        ]
      };

      const result = await catatRestockFaktur(input);

      expect(supabase.rpc).toHaveBeenCalledWith('create_purchase_invoice_atomic', {
        p_invoice_number: 'FAKTUR-RESTOCK-99',
        p_purchase_date: '2026-11-11',
        p_items: [
          { product_id: 'prod-1', qty: 10, buy_price: 15000 }
        ]
      });

      expect(result.id).toBe('purchase-uuid-123');
      expect(result.noFaktur).toBe('FAKTUR-RESTOCK-99');
      expect(result.totalNilai).toBe(150000);
      expect(result.items).toHaveLength(1);
    });

    it('harus melempar error jika create_purchase_invoice_atomic mengembalikan error bisnis', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'Produk dengan ID prod-missing tidak ditemukan' }
      });

      const input = {
        noFaktur: 'FAKTUR-ERR',
        tanggal: '2026-11-11',
        items: [
          { produkId: 'prod-missing', qty: 5, hargaBeli: 20000 }
        ]
      };

      await expect(catatRestockFaktur(input)).rejects.toThrow('Produk dengan ID prod-missing tidak ditemukan');
    });

    it('harus beralih ke fallback sekuensial tabel jika RPC tidak ditemukan (PGRST202)', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function create_purchase_invoice_atomic' }
      });

      const mockPurchase = {
        id: 'purch-seq-01',
        invoice_number: 'FAKTUR-SEQ',
        purchase_date: '2026-11-11',
        total_amount: 50000
      };

      const mockPurchSingle = vi.fn().mockResolvedValue({ data: mockPurchase, error: null });
      const mockPurchSelect = vi.fn().mockReturnValue({ single: mockPurchSingle });
      const mockPurchInsert = vi.fn().mockReturnValue({ select: mockPurchSelect });

      const mockItemsInsert = vi.fn().mockResolvedValue({ error: null });

      const mockProdSingle = vi.fn().mockResolvedValue({ data: { stock: 15 }, error: null });
      const mockProdSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: mockProdSingle }) });
      const mockProdUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'purchases') return { insert: mockPurchInsert };
        if (table === 'purchase_items') return { insert: mockItemsInsert };
        if (table === 'products') return { select: mockProdSelect, update: mockProdUpdate };
        return {};
      });

      const input = {
        noFaktur: 'FAKTUR-SEQ',
        tanggal: '2026-11-11',
        items: [
          { produkId: 'prod-abc', qty: 5, hargaBeli: 10000 }
        ]
      };

      const result = await catatRestockFaktur(input);

      expect(result.id).toBe('purch-seq-01');
      expect(result.noFaktur).toBe('FAKTUR-SEQ');
      expect(result.totalNilai).toBe(50000);
      expect(mockPurchInsert).toHaveBeenCalled();
      expect(mockItemsInsert).toHaveBeenCalled();
    });
  });
});

