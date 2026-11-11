import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../lib/supabaseClient';
import { getActivePokokTariff, payMemberPrincipalSavings } from './complianceService';
import * as savingsRateService from './savingsRateService';

describe('payMemberPrincipalSavings and getActivePokokTariff', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getActivePokokTariff', () => {
    it('mengembalikan tarif dari savings_rate_tiers jika tier aktif ditemukan', async () => {
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'tier-pokok-1',
                  deposit_type_code: 'POKOK',
                  start_year: 2024,
                  start_month: 1,
                  end_year: null,
                  end_month: null,
                  monthly_rate: 15000,
                },
              ],
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      const tariff = await getActivePokokTariff();
      expect(tariff).toBe(15000);
    });

    it('fallback ke default_amount di deposit_types jika tidak ada tier aktif', async () => {
      vi.spyOn(savingsRateService, 'getRateTiers').mockResolvedValue([]);
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-1', code: 'POKOK', name: 'Simpanan Pokok', default_amount: 20000 },
              ],
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      const tariff = await getActivePokokTariff();
      expect(tariff).toBe(20000);
    });

    it('fallback ke default Rp 10.000 jika database kosong atau error', async () => {
      vi.spyOn(savingsRateService, 'getRateTiers').mockRejectedValue(new Error('Network error'));
      vi.spyOn(supabase, 'from').mockImplementation(() => {
        return {
          select: vi.fn().mockResolvedValue({
            data: [],
            error: new Error('Query error'),
          }),
        } as any;
      });

      const tariff = await getActivePokokTariff();
      expect(tariff).toBe(10000);
    });
  });

  describe('payMemberPrincipalSavings', () => {
    it('gagal jika memberId kosong atau amount <= 0', async () => {
      const res1 = await payMemberPrincipalSavings({ memberId: '', amount: 10000 });
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('Member ID');

      const res2 = await payMemberPrincipalSavings({ memberId: 'm-1', amount: 0 });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('Nominal');
    });

    it('berhasil membuat rekening baru jika belum ada dan menyisipkan transaksi pelunasan simpanan pokok', async () => {
      const insertedRows: any[] = [];
      const insertedAccounts: any[] = [];

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-pokok', code: 'POKOK', name: 'Simpanan Pokok' },
              ],
              error: null,
            }),
          } as any;
        }

        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              const account = { id: 'md-new-123', ...payload };
              insertedAccounts.push(account);
              return {
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: account, error: null }),
                }),
              };
            }),
          } as any;
        }

        if (table === 'deposit_transactions') {
          return {
            insert: vi.fn().mockImplementation((row: any) => {
              insertedRows.push(row);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'tx-1', ...row }, error: null }),
                }),
              };
            }),
          } as any;
        }

        return {} as any;
      });

      const res = await payMemberPrincipalSavings({
        memberId: 'm-101',
        amount: 10000,
        paymentMethod: 'cash',
        notes: 'Pelunasan Simpanan Pokok Baru',
      });

      expect(res.success).toBe(true);
      expect(insertedAccounts).toHaveLength(1);
      expect(insertedAccounts[0].member_id).toBe('m-101');
      expect(insertedAccounts[0].deposit_type_id).toBe('dt-pokok');

      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0].member_deposit_id).toBe('md-new-123');
      expect(insertedRows[0].amount).toBe(10000);
      expect(insertedRows[0].transaction_type).toBe('deposit');
      expect(insertedRows[0].payment_method).toBe('cash');
      expect(insertedRows[0].reference_no).toMatch(/^KW-POKOK-/);
      expect(insertedRows[0].description).toBe('Pelunasan Simpanan Pokok Baru');
    });

    it('menggunakan rekening yang sudah ada jika member_deposits telah tersedia', async () => {
      const insertedRows: any[] = [];

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-pokok', code: 'POKOK', name: 'Simpanan Pokok' },
              ],
              error: null,
            }),
          } as any;
        }

        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'md-existing-999', member_id: 'm-102', deposit_type_id: 'dt-pokok' },
                    error: null,
                  }),
                }),
              }),
            }),
          } as any;
        }

        if (table === 'deposit_transactions') {
          return {
            insert: vi.fn().mockImplementation((row: any) => {
              insertedRows.push(row);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'tx-2', ...row }, error: null }),
                }),
              };
            }),
          } as any;
        }

        return {} as any;
      });

      const res = await payMemberPrincipalSavings({
        memberId: 'm-102',
        amount: 25000,
        paymentMethod: 'transfer',
      });

      expect(res.success).toBe(true);
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0].member_deposit_id).toBe('md-existing-999');
      expect(insertedRows[0].amount).toBe(25000);
      expect(insertedRows[0].payment_method).toBe('transfer');
      expect(insertedRows[0].description).toBe('Pelunasan Simpanan Pokok Anggota');
    });
  });
});
