import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getWithdrawalDetailedLedger,
  getWithdrawalSummary,
  calculateWithdrawalSummary,
  exportWithdrawalReportExcel,
  categorizeDepositType,
  isLebaran,
  formatRupiah,
  sanitizeNumber,
  WithdrawalLedgerItem
} from './withdrawalReportService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn()
  }
}));

describe('withdrawalReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createQueryMock(data: any, error: any = null) {
    const obj: any = {};
    const mockPromise = Promise.resolve({ data, error });
    obj.select = vi.fn(() => obj);
    obj.eq = vi.fn(() => obj);
    obj.gte = vi.fn(() => obj);
    obj.lte = vi.fn(() => obj);
    obj.in = vi.fn(() => obj);
    obj.order = vi.fn(() => obj);
    obj.then = (onResolve: any, onReject: any) => mockPromise.then(onResolve, onReject);
    return obj;
  }

  describe('Utility & Helper Functions', () => {
    it('formatRupiah formats number to IDR string correctly', () => {
      const formatted = formatRupiah(1500000);
      expect(formatted).toContain('1.500.000');
      expect(formatRupiah(0)).toContain('0');
    });

    it('sanitizeNumber handles numbers, numeric strings, and invalid values with fallbacks', () => {
      expect(sanitizeNumber(250000)).toBe(250000);
      expect(sanitizeNumber('750000')).toBe(750000);
      expect(sanitizeNumber('invalid', 100)).toBe(100);
      expect(sanitizeNumber(null, 0)).toBe(0);
      expect(sanitizeNumber(undefined, 50)).toBe(50);
    });

    it('categorizeDepositType categorizes codes and names accurately', () => {
      expect(categorizeDepositType('SL', 'Simpanan Hari Raya')).toBe('lebaran');
      expect(categorizeDepositType('THR', 'Tabungan Hari Raya')).toBe('lebaran');
      expect(categorizeDepositType(undefined, 'simpanan lebaran idul fitri')).toBe('lebaran');

      expect(categorizeDepositType('SB', 'Simpanan Belanja')).toBe('belanja');
      expect(categorizeDepositType('BELANJA', 'Saldo Toko')).toBe('belanja');
      expect(categorizeDepositType(undefined, 'belanja kasir')).toBe('belanja');

      expect(categorizeDepositType('SP', 'Simpanan Pokok')).toBe('pokok_wajib');
      expect(categorizeDepositType('SW', 'Simpanan Wajib')).toBe('pokok_wajib');
      expect(categorizeDepositType(undefined, 'simpanan pokok anggota')).toBe('pokok_wajib');

      expect(categorizeDepositType('SS', 'Simpanan Sukarela')).toBe('sukarela_lainnya');
      expect(categorizeDepositType('CUSTOM', 'Tabungan Lainnya')).toBe('sukarela_lainnya');
    });

    it('isLebaran identifies variations of lebaran / THR codes, names, and notes', () => {
      expect(isLebaran('LEBARAN')).toBe(true);
      expect(isLebaran('SL')).toBe(true);
      expect(isLebaran('THR')).toBe(true);
      expect(isLebaran('SIMPANAN_LEBARAN')).toBe(true);
      expect(isLebaran(undefined, 'Simpanan Hari Raya')).toBe(true);
      expect(isLebaran(undefined, 'THR 2026')).toBe(true);
      expect(isLebaran(undefined, undefined, 'Penarikan Simpanan Lebaran - Wawan Gunawan')).toBe(true);
      expect(isLebaran(undefined, undefined, undefined, 'Pencairan THR Idul Fitri')).toBe(true);
      expect(isLebaran('SP', 'Simpanan Pokok')).toBe(false);
      expect(isLebaran('SB', 'Simpanan Belanja')).toBe(false);
    });
  });

  describe('getWithdrawalDetailedLedger', () => {
    const mockTxData = [
      {
        id: 'tx-1',
        amount: 1000000,
        created_at: '2025-04-10T10:00:00.000Z',
        reference_no: 'WD-2025-001',
        payment_method: 'transfer',
        notes: 'Pencairan THR Lebaran',
        description: 'Pencairan Simpanan Lebaran',
        created_by: 'user-admin-1',
        transaction_type: 'withdrawal',
        member_deposit_id: 'md-1',
        member_deposits: {
          id: 'md-1',
          member_id: 'm-1',
          deposit_type_id: 'dt-1',
          deposit_types: {
            id: 'dt-1',
            name: 'Simpanan Lebaran',
            code: 'SL'
          },
          anggota: {
            id: 'm-1',
            nama: 'Budi Santoso',
            nrp: '123456',
            pangkat: 'Kapt Inf',
            bank_name: 'BRI',
            bank_account_number: '1234-01-000123-50-1',
            status: 'aktif'
          }
        }
      },
      {
        id: 'tx-2',
        amount: 500000,
        created_at: '2025-04-11T14:30:00.000Z',
        reference_no: 'WD-2025-002',
        payment_method: 'tunai',
        notes: 'Pencairan saldo belanja',
        description: null,
        created_by: 'user-admin-1',
        transaction_type: 'withdrawal',
        member_deposit_id: 'md-2',
        member_deposits: {
          id: 'md-2',
          member_id: 'm-2',
          deposit_type_id: 'dt-2',
          deposit_types: {
            id: 'dt-2',
            name: 'Simpanan Belanja',
            code: 'SB'
          },
          anggota: {
            id: 'm-2',
            nama: 'Siti Aminah',
            nrp: '654321',
            pangkat: 'PNS III/b',
            bank_name: 'Mandiri',
            bank_account_number: '137-00-1234567-8',
            status: 'aktif'
          }
        }
      }
    ];

    const mockLoansData = [
      {
        id: 'loan-1',
        member_id: 'm-1',
        amount: 5000000,
        status: 'active',
        loan_repayments: [
          { amount_paid: 1000000 },
          { amount_paid: 1000000 }
        ]
      }
    ];

    it('successfully fetches and maps withdrawal transactions with active loan detection', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') {
          return createQueryMock(mockTxData, null);
        }
        if (table === 'loans') {
          return createQueryMock(mockLoansData, null);
        }
        return createQueryMock([], null);
      });

      const result = await getWithdrawalDetailedLedger();

      expect(result).toHaveLength(2);
      expect(supabase.from).toHaveBeenCalledWith('deposit_transactions');
      expect(supabase.from).toHaveBeenCalledWith('loans');

      // Member 1 has active loan (5,000,000 - 2,000,000 = 3,000,000 remaining)
      const item1 = result.find(r => r.member_id === 'm-1');
      expect(item1).toBeDefined();
      expect(item1?.has_active_loan).toBe(true);
      expect(item1?.active_loan_balance).toBe(3000000);
      expect(item1?.active_loan_count).toBe(1);
      expect(item1?.member_name).toBe('Budi Santoso');
      expect(item1?.deposit_type_name).toBe('Simpanan Lebaran');
      expect(item1?.payment_method).toBe('transfer');

      // Member 2 has no active loan
      const item2 = result.find(r => r.member_id === 'm-2');
      expect(item2).toBeDefined();
      expect(item2?.has_active_loan).toBe(false);
      expect(item2?.active_loan_balance).toBe(0);
      expect(item2?.active_loan_count).toBe(0);
      expect(item2?.member_name).toBe('Siti Aminah');
    });

    it('applies depositTypeCode filter properly', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') return createQueryMock(mockTxData, null);
        if (table === 'loans') return createQueryMock(mockLoansData, null);
        return createQueryMock([], null);
      });

      // Filter by category 'lebaran'
      const lebaranResult = await getWithdrawalDetailedLedger({ depositTypeCode: 'lebaran' });
      expect(lebaranResult).toHaveLength(1);
      expect(lebaranResult[0].member_id).toBe('m-1');

      // Filter by specific code 'SB'
      const belanjaResult = await getWithdrawalDetailedLedger({ depositTypeCode: 'SB' });
      expect(belanjaResult).toHaveLength(1);
      expect(belanjaResult[0].member_id).toBe('m-2');
    });

    it('applies paymentMethod filter properly', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') return createQueryMock(mockTxData, null);
        if (table === 'loans') return createQueryMock(mockLoansData, null);
        return createQueryMock([], null);
      });

      const tunaiOnly = await getWithdrawalDetailedLedger({ paymentMethod: 'tunai' });
      expect(tunaiOnly).toHaveLength(1);
      expect(tunaiOnly[0].member_name).toBe('Siti Aminah');

      const transferOnly = await getWithdrawalDetailedLedger({ paymentMethod: 'transfer' });
      expect(transferOnly).toHaveLength(1);
      expect(transferOnly[0].member_name).toBe('Budi Santoso');
    });

    it('applies hasActiveLoanOnly filter properly', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') return createQueryMock(mockTxData, null);
        if (table === 'loans') return createQueryMock(mockLoansData, null);
        return createQueryMock([], null);
      });

      const activeLoanOnly = await getWithdrawalDetailedLedger({ hasActiveLoanOnly: true });
      expect(activeLoanOnly).toHaveLength(1);
      expect(activeLoanOnly[0].member_id).toBe('m-1');
      expect(activeLoanOnly[0].has_active_loan).toBe(true);
    });

    it('applies searchQuery filter matching name, NRP, rank, or reference number', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') return createQueryMock(mockTxData, null);
        if (table === 'loans') return createQueryMock(mockLoansData, null);
        return createQueryMock([], null);
      });

      const byName = await getWithdrawalDetailedLedger({ searchQuery: 'Budi' });
      expect(byName).toHaveLength(1);
      expect(byName[0].member_name).toBe('Budi Santoso');

      const byNrp = await getWithdrawalDetailedLedger({ searchQuery: '654321' });
      expect(byNrp).toHaveLength(1);
      expect(byNrp[0].member_name).toBe('Siti Aminah');

      const byRef = await getWithdrawalDetailedLedger({ searchQuery: 'WD-2025-001' });
      expect(byRef).toHaveLength(1);
      expect(byRef[0].member_name).toBe('Budi Santoso');
    });

    it('returns empty array when transaction query returns error', async () => {
      (supabase.from as any).mockReturnValue(createQueryMock(null, { message: 'Database connection failed' }));

      const result = await getWithdrawalDetailedLedger();
      expect(result).toEqual([]);
    });

    it('successfully resolves Wawan Gunawan withdrawal and unlinked relationships from description', async () => {
      const unlinkedTx = [
        {
          id: 'tx-wawan',
          amount: 2500000,
          created_at: '2026-10-15T09:00:00.000Z',
          reference_no: 'KW-WD-991',
          payment_method: 'Transfer (BRI - 92185332)',
          notes: 'Pencairan THR Idul Fitri',
          description: 'Penarikan Simpanan Lebaran - Wawan Gunawan',
          created_by: 'admin-1',
          transaction_type: 'withdrawal',
          member_deposit_id: 'md-orphan',
          member_deposits: null // Unlinked
        }
      ];

      const anggotaList = [
        {
          id: 'm-wawan',
          nama: 'Wawan Gunawan',
          nrp: '92185332',
          pangkat: 'PNS III/a',
          bank_name: 'BRI',
          bank_account_number: '92185332001',
          status: 'aktif'
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') {
          return createQueryMock(unlinkedTx);
        }
        if (table === 'member_deposits') {
          return createQueryMock([]);
        }
        if (table === 'anggota') {
          return createQueryMock(anggotaList);
        }
        if (table === 'loans') {
          return createQueryMock([]);
        }
        return createQueryMock([]);
      });

      const result = await getWithdrawalDetailedLedger();
      expect(result).toHaveLength(1);
      expect(result[0].member_name).toBe('Wawan Gunawan');
      expect(result[0].member_nrp).toBe('92185332');
      expect(result[0].deposit_type_name).toBe('Simpanan Lebaran');
      expect(result[0].deposit_type_code).toBe('LEBARAN');
      expect(result[0].amount).toBe(2500000);
      expect(result[0].reference_no).toBe('KW-WD-991');
    });

    it('handles unexpected exceptions gracefully', async () => {
      (supabase.from as any).mockImplementation(() => {
        throw new Error('Fatal socket failure');
      });

      const result = await getWithdrawalDetailedLedger();
      expect(result).toEqual([]);
    });
  });

  describe('calculateWithdrawalSummary & getWithdrawalSummary', () => {
    const sampleItems: WithdrawalLedgerItem[] = [
      {
        id: 'tx-1',
        member_id: 'm-1',
        member_name: 'Budi Santoso',
        member_nrp: '123456',
        member_rank: 'Kapt Inf',
        bank_name: 'BRI',
        bank_account_number: '1234',
        deposit_type_id: 'dt-1',
        deposit_type_code: 'SL',
        deposit_type_name: 'Simpanan Lebaran',
        amount: 2000000,
        transaction_date: '2025-04-10T10:00:00.000Z',
        reference_no: 'WD-001',
        payment_method: 'transfer',
        notes: 'Pencairan THR',
        created_by: 'admin',
        has_active_loan: true,
        active_loan_balance: 5000000,
        active_loan_count: 1
      },
      {
        id: 'tx-2',
        member_id: 'm-1', // Same member doing another withdrawal
        member_name: 'Budi Santoso',
        member_nrp: '123456',
        member_rank: 'Kapt Inf',
        bank_name: 'BRI',
        bank_account_number: '1234',
        deposit_type_id: 'dt-3',
        deposit_type_code: 'SP',
        deposit_type_name: 'Simpanan Pokok',
        amount: 1000000,
        transaction_date: '2025-04-11T10:00:00.000Z',
        reference_no: 'WD-002',
        payment_method: 'tunai',
        notes: 'Pencairan Pokok',
        created_by: 'admin',
        has_active_loan: true,
        active_loan_balance: 5000000,
        active_loan_count: 1
      },
      {
        id: 'tx-3',
        member_id: 'm-2',
        member_name: 'Siti Aminah',
        member_nrp: '654321',
        member_rank: 'PNS III/b',
        bank_name: 'Mandiri',
        bank_account_number: '5678',
        deposit_type_id: 'dt-2',
        deposit_type_code: 'SB',
        deposit_type_name: 'Simpanan Belanja',
        amount: 500000,
        transaction_date: '2025-04-12T10:00:00.000Z',
        reference_no: 'WD-003',
        payment_method: 'tunai',
        notes: 'Pencairan Belanja',
        created_by: 'admin',
        has_active_loan: false,
        active_loan_balance: 0,
        active_loan_count: 0
      }
    ];

    it('calculates total withdrawal amount, counts, and breakdown metrics accurately', () => {
      const summary = calculateWithdrawalSummary(sampleItems);

      expect(summary.totalWithdrawalAmount).toBe(3500000); // 2jt + 1jt + 500rb
      expect(summary.totalTransactions).toBe(3);
      expect(summary.uniqueMembers).toBe(2); // m-1 and m-2

      // Breakdown by type
      expect(summary.breakdownByType.lebaran).toBe(2000000);
      expect(summary.breakdownByType.pokok_wajib).toBe(1000000);
      expect(summary.breakdownByType.belanja).toBe(500000);
      expect(summary.breakdownByType.sukarela_lainnya).toBe(0);

      // Breakdown by method
      // Tunai: tx-2 (1jt) + tx-3 (500rb) = 1.5jt (42.9%)
      // Transfer: tx-1 (2jt) = 2jt (57.1%)
      expect(summary.breakdownByMethod.tunai.amount).toBe(1500000);
      expect(summary.breakdownByMethod.tunai.count).toBe(2);
      expect(summary.breakdownByMethod.transfer.amount).toBe(2000000);
      expect(summary.breakdownByMethod.transfer.count).toBe(1);

      // Active loan surveillance: m-1 has active loan, m-2 does not
      // Total loan obligation should not double count m-1's balance
      expect(summary.membersWithActiveLoansCount).toBe(1);
      expect(summary.totalActiveLoansObligation).toBe(5000000);
    });

    it('getWithdrawalSummary reuses preloaded items when provided', async () => {
      const summary = await getWithdrawalSummary(undefined, sampleItems);
      expect(summary.totalTransactions).toBe(3);
      expect(summary.totalWithdrawalAmount).toBe(3500000);
    });
  });

  describe('exportWithdrawalReportExcel', () => {
    const sampleData: WithdrawalLedgerItem[] = [
      {
        id: 'tx-1',
        member_id: 'm-1',
        member_name: 'Budi Santoso',
        member_nrp: '123456',
        member_rank: 'Kapt Inf',
        bank_name: 'BRI',
        bank_account_number: '1234-01-000123-50-1',
        deposit_type_id: 'dt-1',
        deposit_type_code: 'SL',
        deposit_type_name: 'Simpanan Lebaran',
        amount: 2500000,
        transaction_date: '2025-04-10T10:00:00.000Z',
        reference_no: 'WD-001',
        payment_method: 'transfer',
        notes: 'Pencairan THR',
        created_by: 'admin',
        has_active_loan: true,
        active_loan_balance: 4000000,
        active_loan_count: 1
      }
    ];

    const sampleSummary = calculateWithdrawalSummary(sampleData);

    it('generates Excel workbook buffer with headers, KPI box, and formatted rows without error', async () => {
      const buffer = await exportWithdrawalReportExcel(sampleData, sampleSummary, {
        startDate: '2025-04-01',
        endDate: '2025-04-30',
        filterLabel: 'Simpanan Lebaran'
      });

      expect(buffer).toBeDefined();
      expect(buffer.byteLength).toBeGreaterThan(100);
    });
  });
});
