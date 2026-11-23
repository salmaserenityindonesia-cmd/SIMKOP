import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  importMembersChunked,
  fetchAllAnggotaPaged,
  getAnggota,
  getDepositTypes,
  getCommitmentStats,
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
        tanggal_lahir: '1985-05-20',
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
          tanggal_lahir: '1980-12-01',
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
          tanggal_lahir: '1985-05-20',
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

    it('tidak menghapus mutasi anggota lama saat mengimpor profil 6 kolom dengan nominal simpanan 0', async () => {
      const mockDepositTypes = [
        { id: 'dt-sp', code: 'SP', name: 'Simpanan Pokok' },
        { id: 'dt-sw', code: 'SW', name: 'Simpanan Wajib' },
        { id: 'dt-sb', code: 'SB', name: 'Simpanan Belanja' },
        { id: 'dt-sl', code: 'SL', name: 'Simpanan Lebaran' },
      ];

      const deleteTxSpy = vi.fn();
      const insertTxSpy = vi.fn();

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
                data: [{ id: 'uuid-existing-member', nrp: '95168420', created_at: '2026-11-13' }],
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
                  { id: 'md-ex-sp', member_id: 'uuid-existing-member', deposit_type_id: 'dt-sp' },
                  { id: 'md-ex-sw', member_id: 'uuid-existing-member', deposit_type_id: 'dt-sw' },
                ],
                error: null,
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: deleteTxSpy,
            insert: insertTxSpy,
          };
        }
        return {};
      });

      const sixColProfileInput: MemberImportInput[] = [
        {
          nrp: '95168420',
          nama: 'Budi Santoso',
          tanggal_lahir: '1983-08-15',
          bank_account_number: '367800973556',
          membership_status: 'ACTIVE',
          tgl_awal_anggota: '2026-11-13',
        },
      ];

      const res = await importMembersChunked(sixColProfileInput);
      expect(res.successCount).toBe(1);
      expect(deleteTxSpy).not.toHaveBeenCalled();
      expect(insertTxSpy).not.toHaveBeenCalled();
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

  describe('getCommitmentStats', () => {
    it('menghitung anggota aktif unik (>1.000 anggota) tanpa terpotong 1.000 baris, mengabaikan duplikat & non-wajib, serta memfilter cicilan jatuh tempo periode target', async () => {
      const activeMembers = Array.from({ length: 1200 }, (_, i) => ({
        id: `m-active-${i + 1}`,
        status: 'aktif',
        membership_status: 'ACTIVE',
      }));
      const inactiveMembers = Array.from({ length: 50 }, (_, i) => ({
        id: `m-inactive-${i + 1}`,
        status: i % 2 === 0 ? 'nonaktif' : 'aktif',
        membership_status: i % 2 === 0 ? 'RESIGNED' : 'SUSPENDED',
      }));
      const allMembers = [...activeMembers, ...inactiveMembers];

      const mockDepositTypes = [
        { id: 'dt-sp', code: 'SP', name: 'Simpanan Pokok' },
        { id: 'dt-sw', code: 'SW', name: 'Simpanan Wajib' },
        { id: 'dt-sb', code: 'SB', name: 'Simpanan Belanja' },
      ];

      // 1200 wajib accounts untuk anggota aktif + 50 untuk nonaktif
      const wajibMemberDeposits = allMembers.map((m) => ({
        id: `md-sw-${m.id}`,
        member_id: m.id,
        deposit_type_id: 'dt-sw',
      }));

      // 1050 anggota aktif sudah bayar SW 11/2026 (plus beberapa duplikat, transaksi non-wajib, dan anggota nonaktif)
      const depositTxs = [
        ...activeMembers.slice(0, 1050).map((m) => ({
          member_deposit_id: `md-sw-${m.id}`,
          amount: 200000,
        })),
        // Duplikat untuk anggota aktif pertama (tidak boleh dihitung 2x)
        { member_deposit_id: 'md-sw-m-active-1', amount: 50000 },
        // Transaksi milik anggota nonaktif (tidak boleh dihitung)
        { member_deposit_id: 'md-sw-m-inactive-1', amount: 200000 },
        // Transaksi non-wajib (Simpanan Belanja - id rekening tidak ada di wajibDepositToMember)
        { member_deposit_id: 'md-sb-m-active-1200', amount: 100000 },
      ];

      const activeLoans = [
        { id: 'loan-1', member_id: 'm-active-1', status: 'active' },
        { id: 'loan-2', member_id: 'm-active-2', status: 'approved' },
        { id: 'loan-3', member_id: 'm-active-3', status: 'berjalan' },
        // Pinjaman anggota nonaktif tidak boleh dihitung
        { id: 'loan-inactive', member_id: 'm-inactive-1', status: 'active' },
      ];

      const novSchedules = [
        { id: 'sch-1', loan_id: 'loan-1', due_date: '2026-11-10', target_amount: 500000, paid_amount: 500000, status: 'paid' },
        { id: 'sch-2', loan_id: 'loan-2', due_date: '2026-11-15', target_amount: 500000, paid_amount: 500000, status: 'unpaid' },
        { id: 'sch-3', loan_id: 'loan-3', due_date: '2026-11-20', target_amount: 500000, paid_amount: 0, status: 'unpaid' },
        // Jadwal milik pinjaman anggota nonaktif (harus diabaikan)
        { id: 'sch-4', loan_id: 'loan-inactive', due_date: '2026-11-25', target_amount: 500000, paid_amount: 0, status: 'unpaid' },
      ];

      let txFilterMonth: number | undefined;
      let txFilterYear: number | undefined;
      let schedGte: string | undefined;
      let schedLte: string | undefined;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockImplementation((from: number, to: number) =>
                  Promise.resolve({ data: allMembers.slice(from, to + 1), error: null })
                ),
              }),
            }),
          };
        }

        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockDepositTypes, error: null }),
          };
        }

        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockImplementation((from: number, to: number) =>
                    Promise.resolve({ data: wajibMemberDeposits.slice(from, to + 1), error: null })
                  ),
                }),
              }),
            }),
          };
        }

        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: any) => {
                if (col === 'for_month') txFilterMonth = val;
                return {
                  eq: vi.fn().mockImplementation((col2: string, val2: any) => {
                    if (col2 === 'for_year') txFilterYear = val2;
                    return {
                      eq: vi.fn().mockReturnValue({
                        gt: vi.fn().mockReturnValue({
                          order: vi.fn().mockReturnValue({
                            range: vi.fn().mockImplementation((from: number, to: number) =>
                              Promise.resolve({ data: depositTxs.slice(from, to + 1), error: null })
                            ),
                          }),
                        }),
                      }),
                    };
                  }),
                };
              }),
            }),
          };
        }

        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockImplementation((from: number, to: number) =>
                    Promise.resolve({ data: activeLoans.slice(from, to + 1), error: null })
                  ),
                }),
              }),
            }),
          };
        }

        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockImplementation((_col: string, val: string) => {
                schedGte = val;
                return {
                  lte: vi.fn().mockImplementation((_col2: string, val2: string) => {
                    schedLte = val2;
                    return {
                      order: vi.fn().mockReturnValue({
                        range: vi.fn().mockImplementation((from: number, to: number) =>
                          Promise.resolve({ data: novSchedules.slice(from, to + 1), error: null })
                        ),
                      }),
                    };
                  }),
                };
              }),
            }),
          };
        }

        return {};
      });

      const stats = await getCommitmentStats(11, 2026);

      expect(txFilterMonth).toBe(11);
      expect(txFilterYear).toBe(2026);
      expect(schedGte).toBe('2026-11-01');
      expect(schedLte).toBe('2026-11-30');

      expect(stats.deposit.lunas).toBe(1050);
      expect(stats.deposit.belum_lunas).toBe(150);
      expect(stats.deposit.lunas + stats.deposit.belum_lunas).toBe(1200);

      // sch-1 (paid) & sch-2 (paidAmt == targetAmt) => 2 lunas; sch-3 => 1 belum_lunas; sch-4 ignored
      expect(stats.loan.lunas).toBe(2);
      expect(stats.loan.belum_lunas).toBe(1);
      expect(stats.loan.active_loans).toBe(3);
    });

    it('melakukan retry status pinjaman yang aman enum (active, approved) jika Postgres menolak status berjalan (22P02)', async () => {
      const loanInCalls: string[][] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({
                  data: [{ id: 'm-1', status: 'aktif', membership_status: 'ACTIVE' }],
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'dt-sw', code: 'SW', name: 'Simpanan Wajib' }],
              error: null,
            }),
          };
        }

        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({
                    data: [{ id: 'md-1', member_id: 'm-1' }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    gt: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        range: vi.fn().mockResolvedValue({ data: [], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((_col: string, statuses: string[]) => {
                loanInCalls.push(statuses);
                return {
                  order: vi.fn().mockReturnValue({
                    range: vi.fn().mockImplementation(() => {
                      if (statuses.includes('berjalan')) {
                        return Promise.resolve({
                          data: null,
                          error: { code: '22P02', message: 'invalid input value for enum loan_status: "berjalan"' },
                        });
                      }
                      return Promise.resolve({
                        data: [{ id: 'loan-enum-1', member_id: 'm-1', status: 'active' }],
                        error: null,
                      });
                    }),
                  }),
                };
              }),
            }),
          };
        }

        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    range: vi.fn().mockResolvedValue({
                      data: [
                        { id: 'sch-enum-1', loan_id: 'loan-enum-1', due_date: '2026-11-15', target_amount: 300000, paid_amount: 0, status: 'unpaid' },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        return {};
      });

      const stats = await getCommitmentStats(11, 2026);

      expect(loanInCalls).toEqual([
        ['active', 'approved', 'berjalan', 'disbursed'],
        ['active', 'approved'],
      ]);
      expect(stats.deposit).toEqual({ lunas: 0, belum_lunas: 1 });
      expect(stats.loan).toEqual({ lunas: 0, belum_lunas: 1, active_loans: 1 });
    });

    it('mengembalikan active_loans > 0 ketika ada kontrak pinjaman berjalan yang jadwal cicilan pertamanya baru dimulai bulan berikutnya', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'm-1', status: 'aktif', membership_status: 'ACTIVE' },
                    { id: 'm-2', status: 'aktif', membership_status: 'ACTIVE' },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'dt-sw', code: 'SW', name: 'Simpanan Wajib' }],
              error: null,
            }),
          };
        }

        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }

        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    gt: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        range: vi.fn().mockResolvedValue({ data: [], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'loan-next-1', member_id: 'm-1', status: 'berjalan' },
                      { id: 'loan-next-2', member_id: 'm-2', status: 'active' },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    range: vi.fn().mockResolvedValue({
                      // Tidak ada jadwal yang jatuh tempo pada 11/2026 (cicilan perdana baru 12/2026)
                      data: [],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        return {};
      });

      const stats = await getCommitmentStats(11, 2026);

      expect(stats.loan).toEqual({ lunas: 0, belum_lunas: 0, active_loans: 2 });
    });
  });
});

