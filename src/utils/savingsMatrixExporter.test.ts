import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateSavingsMatrixWorkbook,
  exportSavingsMatrixExcel,
  getColumnLetter,
  formatJoinDate,
  generateHorizontalMonths,
  calculateDeterministicBaseline
} from './savingsMatrixExporter';
import { supabase } from '../lib/supabaseClient';
import { SavingsRateTier } from '../services/savingsRateService';

// Mock Supabase
vi.mock('../lib/supabaseClient', () => {
  const createMockBuilder = (data: any = []) => {
    const builder: any = {
      select: vi.fn().mockImplementation(() => builder),
      order: vi.fn().mockImplementation(() => builder),
      eq: vi.fn().mockImplementation(() => builder),
      then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve)
    };
    return builder;
  };

  return {
    supabase: {
      from: vi.fn().mockImplementation(() => createMockBuilder([]))
    }
  };
});

const createMockBuilder = (data: any = []) => {
  const builder: any = {
    select: vi.fn().mockImplementation(() => builder),
    order: vi.fn().mockImplementation(() => builder),
    eq: vi.fn().mockImplementation(() => builder),
    then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve)
  };
  return builder;
};

describe('savingsMatrixExporter', () => {
  let mockClick: any;
  let mockAnchor: any;
  let mockCreateElement: any;
  let mockCreateObjectURL: any;
  let mockRevokeObjectURL: any;

  const mockRateTiers: SavingsRateTier[] = [
    {
      id: 'tier-wajib-1',
      deposit_type_code: 'WAJIB',
      start_year: 2021,
      start_month: 1,
      end_year: 2025,
      end_month: 10,
      monthly_rate: 150000,
      notes: 'Tarif Lama'
    },
    {
      id: 'tier-wajib-2',
      deposit_type_code: 'WAJIB',
      start_year: 2025,
      start_month: 11,
      end_year: null,
      end_month: null,
      monthly_rate: 200000,
      notes: 'Tarif Baru'
    }
  ];

  const mockMembers = [
    {
      id: 'mem-1',
      nrp: '1001',
      nama: 'Budi Santoso',
      created_at: '2021-05-15T00:00:00.000Z',
      tgl_awal_anggota: '2021-05-01',
      status: 'aktif',
      membership_status: 'ACTIVE'
    },
    {
      id: 'mem-2',
      nrp: '1002',
      nama: 'Siti Aminah',
      created_at: '2024-01-10T00:00:00.000Z',
      tgl_awal_anggota: '2024-01-01',
      status: 'aktif',
      membership_status: 'ACTIVE'
    },
    {
      id: 'mem-3',
      nrp: '1003',
      nama: 'Ahmad Fauzi',
      created_at: '2024-06-01T00:00:00.000Z',
      tgl_awal_anggota: '2024-06-01',
      status: 'aktif',
      membership_status: 'ACTIVE'
    }
  ];

  const mockMemberDeposits = [
    {
      id: 'md-1',
      member_id: 'mem-1',
      deposit_type_id: 'dt-wajib',
      deposit_types: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
      deposit_transactions: [
        {
          id: 'tx-1',
          amount: 300000,
          description: 'Saldo Awal Migrasi',
          transaction_type: 'deposit',
          for_month: null,
          for_year: null
        }
      ]
    },
    {
      id: 'md-2',
      member_id: 'mem-2',
      deposit_type_id: 'dt-wajib',
      deposit_types: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
      deposit_transactions: [
        {
          id: 'tx-2-1',
          amount: 150000,
          description: 'Setoran Matriks WAJIB Jan 2024',
          transaction_type: 'deposit',
          for_month: 1,
          for_year: 2024
        },
        {
          id: 'tx-2-2',
          amount: 150000,
          description: 'Setoran Matriks WAJIB Feb 2024',
          transaction_type: 'deposit',
          for_month: 2,
          for_year: 2024
        }
      ]
    },
    {
      id: 'md-3',
      member_id: 'mem-3',
      deposit_type_id: 'dt-wajib',
      deposit_types: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
      deposit_transactions: [
        {
          id: 'tx-3',
          amount: 500000, // Saldo acuan 500.000, namun tarif 150.000/bln -> alokasi FIFO 450.000 (selisih -50.000 / KURANG)
          description: 'Saldo Awal Migrasi',
          transaction_type: 'deposit',
          for_month: null,
          for_year: null
        }
      ]
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_types') {
        return createMockBuilder([{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }]);
      }
      return createMockBuilder([]);
    });

    mockClick = vi.fn();
    mockAnchor = { href: '', download: '', click: mockClick };
    mockCreateElement = vi.fn().mockReturnValue(mockAnchor);
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    mockRevokeObjectURL = vi.fn();

    (globalThis as any).document = {
      createElement: mockCreateElement,
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      }
    };
    (globalThis as any).URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL
    };
    (globalThis as any).Blob = class MockBlob {
      content: any;
      type: any;
      constructor(content: any, options: any) {
        this.content = content;
        this.type = options?.type;
      }
    };
  });

  describe('Helper Functions', () => {
    it('getColumnLetter should convert 1-based column indexes to Excel letters', () => {
      expect(getColumnLetter(1)).toBe('A');
      expect(getColumnLetter(2)).toBe('B');
      expect(getColumnLetter(4)).toBe('D');
      expect(getColumnLetter(5)).toBe('E');
      expect(getColumnLetter(26)).toBe('Z');
      expect(getColumnLetter(27)).toBe('AA');
      expect(getColumnLetter(28)).toBe('AB');
      expect(getColumnLetter(52)).toBe('AZ');
      expect(getColumnLetter(53)).toBe('BA');
      expect(getColumnLetter(70)).toBe('BR');
    });

    it('formatJoinDate should format dates into YYYY-MM-DD or return fallback', () => {
      expect(formatJoinDate('2021-05-15T00:00:00.000Z')).toBe('2021-05-15');
      expect(formatJoinDate('2024-01-01')).toBe('2024-01-01');
      expect(formatJoinDate(null)).toBe('-');
      expect(formatJoinDate(undefined)).toBe('-');
    });

    it('generateHorizontalMonths should build chronological month column definitions', () => {
      const months = generateHorizontalMonths(2024, 1, 2024, 3, 5);
      expect(months).toHaveLength(3);
      expect(months[0]).toEqual({
        year: 2024,
        month: 1,
        label: 'Jan-24',
        key: '2024-01',
        colIndex: 5,
        colLetter: 'E'
      });
      expect(months[1]).toEqual({
        year: 2024,
        month: 2,
        label: 'Feb-24',
        key: '2024-02',
        colIndex: 6,
        colLetter: 'F'
      });
      expect(months[2]).toEqual({
        year: 2024,
        month: 3,
        label: 'Mar-24',
        key: '2024-03',
        colIndex: 7,
        colLetter: 'G'
      });
    });

    it('calculateDeterministicBaseline should calculate accurate balance without day-of-month comparison issues', () => {
      // 1. Tanggal masuk awal bulan (1 Mei 2021) vs tengah bulan (5 Mei 2021)
      const belanjaTiers: SavingsRateTier[] = [
        {
          id: 'tier-sb',
          deposit_type_code: 'BELANJA',
          start_year: 2021,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 50000,
          notes: 'Tarif Flat Belanja'
        }
      ];

      // Dari Mei 2021 hingga Nov 2026: (2026 * 12 + 11) - (2021 * 12 + 5) + 1 = 67 bulan
      // 67 bulan * 50.000 = 3.350.000
      const baseline1 = calculateDeterministicBaseline('2021-05-01', 2026, 11, 'BELANJA', belanjaTiers);
      const baseline2 = calculateDeterministicBaseline('2021-05-05', 2026, 11, 'BELANJA', belanjaTiers);
      expect(baseline1).toBe(3350000);
      expect(baseline2).toBe(3350000);
      expect(baseline1).toBe(baseline2); // Keduanya identik tanpa day-comparison bug

      // 2. Fallback untuk tanggal invalid / kosong
      expect(calculateDeterministicBaseline(null, 2026, 11, 'BELANJA', belanjaTiers)).toBe(0);
      expect(calculateDeterministicBaseline('invalid-date', 2026, 11, 'BELANJA', belanjaTiers)).toBe(0);

      // 3. Tanggal bergabung di masa depan melampaui cut-off
      expect(calculateDeterministicBaseline('2027-01-01', 2026, 11, 'BELANJA', belanjaTiers)).toBe(0);

      // 4. Perhitungan tarif berjenjang (Simpanan Wajib)
      // Jan 2025 - Des 2025: Jan-Okt (10 bln @ 150k = 1.500.000), Nov-Des (2 bln @ 200k = 400.000) -> 1.900.000
      const wajibBaseline = calculateDeterministicBaseline('2025-01-01', 2025, 12, 'WAJIB', mockRateTiers);
      expect(wajibBaseline).toBe(1900000);
    });
  });

  describe('generateSavingsMatrixWorkbook', () => {
    it('should generate workbook with correct headers and column structure starting at Mar-26', async () => {
      const wb = await generateSavingsMatrixWorkbook({
        depositTypeCode: 'WAJIB',
        startYear: 2024, // clamped to 2026-03
        startMonth: 1,
        endYear: 2026,
        endMonth: 5,
        members: mockMembers,
        rateTiers: mockRateTiers,
        memberDeposits: mockMemberDeposits,
        autoSave: false
      });

      const ws = wb.getWorksheet('Matriks WAJIB');
      expect(ws).toBeDefined();

      // Row 1: Headers
      const headerRow = ws!.getRow(1);
      expect(headerRow.getCell(1).value).toBe('NRP');
      expect(headerRow.getCell(2).value).toBe('Nama Anggota');
      expect(headerRow.getCell(3).value).toBe('Tgl Masuk');
      expect(headerRow.getCell(4).value).toBe('Saldo Awal (Per Mar-26)');
      expect(headerRow.getCell(5).value).toBe('Mar-26');
      expect(headerRow.getCell(6).value).toBe('Apr-26');
      expect(headerRow.getCell(7).value).toBe('Mei-26');
      expect(headerRow.getCell(8).value).toBe('Total Saldo Akhir');
      expect(headerRow.getCell(9).value).toBe('Saldo Acuan Database');
      expect(headerRow.getCell(10).value).toBe('Selisih');
      expect(headerRow.getCell(11).value).toBe('Status Validasi');
    });

    it('should assign correct dynamic Excel formulas to Total Saldo Akhir, Selisih, and Status Validasi', async () => {
      const wb = await generateSavingsMatrixWorkbook({
        depositTypeCode: 'WAJIB',
        endYear: 2026,
        endMonth: 5,
        members: mockMembers,
        rateTiers: mockRateTiers,
        memberDeposits: mockMemberDeposits,
        autoSave: false
      });

      const ws = wb.getWorksheet('Matriks WAJIB');
      expect(ws).toBeDefined();

      // Baris 2 (Budi Santoso):
      // Bulan E-G (Mar-26..Mei-26), Total Saldo Akhir di H (8), Saldo Acuan DB di I (9), Selisih di J (10), Status di K (11)
      const row2 = ws!.getRow(2);
      const saldoAwalCell = row2.getCell(4);
      const totalCell = row2.getCell(8);
      const dbCell = row2.getCell(9);
      const selisihCell = row2.getCell(10);
      const statusCell = row2.getCell(11);

      expect(saldoAwalCell.value).toBe(300000);
      expect(dbCell.value).toBe(300000);

      // Total formula: D2+SUM(E2:G2)
      expect(totalCell.formula).toBe('D2+SUM(E2:G2)');
      expect(totalCell.result).toBe(300000);

      // Selisih formula: H2-I2
      expect(selisihCell.formula).toBe('H2-I2');
      expect(selisihCell.result).toBe(0);

      // Status Validasi formula: IF(J2=0,"SEIMBANG",IF(J2<0,"KURANG","LEBIH"))
      expect(statusCell.formula).toBe('IF(J2=0,"SEIMBANG",IF(J2<0,"KURANG","LEBIH"))');
      expect(statusCell.result).toBe('SEIMBANG');
    });

    it('should separate post-March 2026 monthly mutations from Saldo Awal (Per Mar-26) and stay SEIMBANG', async () => {
      const memberWithPostMar = [
        { id: 'mem-iwan', nrp: '2001', nama: 'Iwan Budiman', created_at: '2021-05-01', status: 'aktif' }
      ];
      const depositsWithPostMar = [
        {
          id: 'md-iwan',
          member_id: 'mem-iwan',
          deposit_type_id: 'dt-wajib',
          deposit_types: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
          deposit_transactions: [
            { id: 'tx-open', amount: 13400000, transaction_type: 'deposit', for_month: 2, for_year: 2026, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
            { id: 'tx-mar', amount: 200000, transaction_type: 'deposit', for_month: 3, for_year: 2026, description: 'Setoran Mar-26' },
            { id: 'tx-apr', amount: 200000, transaction_type: 'deposit', for_month: 4, for_year: 2026, description: 'Setoran Apr-26' }
          ]
        }
      ];

      const wb = await generateSavingsMatrixWorkbook({
        depositTypeCode: 'WAJIB',
        endYear: 2026,
        endMonth: 5,
        members: memberWithPostMar,
        rateTiers: mockRateTiers,
        memberDeposits: depositsWithPostMar,
        autoSave: false
      });

      const ws = wb.getWorksheet('Matriks WAJIB');
      const row2 = ws!.getRow(2);

      expect(row2.getCell(4).value).toBe(13400000); // Saldo Awal (Per Mar-26)
      expect(row2.getCell(5).value).toBe(200000);   // Mar-26
      expect(row2.getCell(6).value).toBe(200000);   // Apr-26
      expect(row2.getCell(7).value).toBeNull();     // Mei-26 (belum ada transaksi)
      expect(row2.getCell(8).result).toBe(13800000); // Total Saldo Akhir
      expect(row2.getCell(9).value).toBe(13800000);  // Saldo Acuan Database
      expect(row2.getCell(10).result).toBe(0);       // Selisih
      expect(row2.getCell(11).result).toBe('SEIMBANG');
    });

    it('should leave months prior to member join date empty (null)', async () => {
      const postCutoffMember = {
        id: 'mem-new-2026',
        nrp: '3001',
        nama: 'Anggota Baru Mei 2026',
        created_at: '2026-05-01T00:00:00.000Z',
        status: 'aktif'
      };
      const wb = await generateSavingsMatrixWorkbook({
        depositTypeCode: 'WAJIB',
        endYear: 2026,
        endMonth: 5,
        members: [postCutoffMember],
        rateTiers: mockRateTiers,
        memberDeposits: [
          {
            id: 'md-new',
            member_id: 'mem-new-2026',
            deposit_type_id: 'dt-wajib',
            deposit_types: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
            deposit_transactions: [
              { id: 'tx-mei', amount: 200000, transaction_type: 'deposit', for_month: 5, for_year: 2026, description: 'Setoran Mei-26' }
            ]
          }
        ],
        autoSave: false
      });

      const ws = wb.getWorksheet('Matriks WAJIB');
      const row2 = ws!.getRow(2);

      // Kolom 5: Mar-26 (sebelum join) -> null
      // Kolom 6: Apr-26 (sebelum join) -> null
      // Kolom 7: Mei-26 (setelah join) -> 200000
      expect(row2.getCell(5).value).toBeNull();
      expect(row2.getCell(6).value).toBeNull();
      expect(row2.getCell(7).value).toBe(200000);
    });

    it('should register conditional formatting rules for the Status Validasi column', async () => {
      const wb = await generateSavingsMatrixWorkbook({
        depositTypeCode: 'WAJIB',
        startYear: 2024,
        startMonth: 1,
        endYear: 2024,
        endMonth: 3,
        members: mockMembers,
        rateTiers: mockRateTiers,
        memberDeposits: mockMemberDeposits,
        autoSave: false
      });

      const ws = wb.getWorksheet('Matriks WAJIB');
      const cfList = (ws as any).conditionalFormattings;
      expect(cfList).toBeDefined();
      expect(cfList.length).toBeGreaterThan(0);

      const statusCf = cfList[0];
      expect(statusCf.rules).toHaveLength(3);
      expect(statusCf.rules[0].formulae).toEqual(['"SEIMBANG"']);
      expect(statusCf.rules[1].formulae).toEqual(['"KURANG"']);
      expect(statusCf.rules[2].formulae).toEqual(['"LEBIH"']);
    });

    it('should query Supabase when options.members, rateTiers, or memberDeposits are not provided', async () => {
      (supabase.from as any).mockImplementation((tableName: string) => {
        if (tableName === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockMembers,
                error: null
              })
            })
          };
        }
        if (tableName === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }],
              error: null
            })
          };
        }
        if (tableName === 'savings_rate_tiers') {
          return createMockBuilder(mockRateTiers);
        }
        if (tableName === 'member_deposits') {
          return {
            select: vi.fn().mockResolvedValue({
              data: mockMemberDeposits,
              error: null
            })
          };
        }
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null })
        };
      });

      const wb = await generateSavingsMatrixWorkbook({
        depositTypeCode: 'WAJIB',
        startYear: 2024,
        startMonth: 1,
        endYear: 2024,
        endMonth: 2,
        autoSave: false
      });

      expect(supabase.from).toHaveBeenCalledWith('anggota');
      expect(supabase.from).toHaveBeenCalledWith('deposit_types');
      expect(wb.getWorksheet('Matriks WAJIB')).toBeDefined();
    });

    it('should include members even if they have no member_deposits or transactions', async () => {
      const memberWithoutDeposits = {
        id: 'mem-zero',
        nrp: '1099',
        nama: 'Zainal Baru',
        created_at: '2024-01-01T00:00:00.000Z',
        status: 'aktif',
        membership_status: 'ACTIVE'
      };

      const wb = await generateSavingsMatrixWorkbook({
        depositTypeCode: 'WAJIB',
        endYear: 2026,
        endMonth: 5,
        members: [memberWithoutDeposits],
        rateTiers: mockRateTiers,
        memberDeposits: [], // kosong sama sekali
        autoSave: false
      });

      const ws = wb.getWorksheet('Matriks WAJIB');
      expect(ws).toBeDefined();

      const row2 = ws!.getRow(2);
      expect(row2.getCell(1).value).toBe('1099');
      expect(row2.getCell(2).value).toBe('Zainal Baru');
      expect(row2.getCell(3).value).toBe('2024-01-01');
      expect(row2.getCell(4).value).toBe(0); // Saldo Awal (Per Mar-26) = 0

      // Kolom 5, 6, 7 (Mar-26, Apr-26, Mei-26) -> null
      expect(row2.getCell(5).value).toBeNull();
      expect(row2.getCell(6).value).toBeNull();
      expect(row2.getCell(7).value).toBeNull();

      // Formula total saldo akhir, selisih, status validasi tetap terbentuk
      const totalCell = row2.getCell(8);
      const dbCell = row2.getCell(9);
      const selisihCell = row2.getCell(10);
      const statusCell = row2.getCell(11);

      expect(totalCell.formula).toBe('D2+SUM(E2:G2)');
      expect(totalCell.result).toBe(0);
      expect(dbCell.value).toBe(0);
      expect(selisihCell.formula).toBe('H2-I2');
      expect(selisihCell.result).toBe(0);
      expect(statusCell.result).toBe('SEIMBANG');
    });

    it('should inclusively include members with different casing or missing status', async () => {
      const variedMembers = [
        { id: 'm1', nrp: '001', nama: 'Member Aktif Lower', created_at: '2024-01-01', status: 'aktif' },
        { id: 'm2', nrp: '002', nama: 'Member Aktif Capitalized', created_at: '2024-01-01', status: 'Aktif' },
        { id: 'm3', nrp: '003', nama: 'Member Active Enum', created_at: '2024-01-01', membership_status: 'ACTIVE' },
        { id: 'm4', nrp: '004', nama: 'Member No Status', created_at: '2024-01-01', status: null, membership_status: null }
      ];

      (supabase.from as any).mockImplementation((tableName: string) => {
        if (tableName === 'anggota') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              expect(cols).not.toContain('tgl_awal_anggota');
              return {
                order: vi.fn().mockResolvedValue({
                  data: variedMembers,
                  error: null
                })
              };
            })
          };
        }
        if (tableName === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }], error: null }) };
        }
        if (tableName === 'savings_rate_tiers') {
          return createMockBuilder(mockRateTiers);
        }
        return createMockBuilder([]);
      });

      const wb = await generateSavingsMatrixWorkbook({
        depositTypeCode: 'WAJIB',
        startYear: 2024,
        startMonth: 1,
        endYear: 2024,
        endMonth: 2,
        autoSave: false
      });

      const ws = wb.getWorksheet('Matriks WAJIB');
      expect(ws).toBeDefined();
      // Baris 1: Header, Baris 2..5: 4 anggota
      expect(ws!.rowCount).toBe(5);
      expect(ws!.getRow(2).getCell(1).value).toBe('001');
      expect(ws!.getRow(3).getCell(1).value).toBe('002');
      expect(ws!.getRow(4).getCell(1).value).toBe('003');
      expect(ws!.getRow(5).getCell(1).value).toBe('004');
    });

    it('should synchronize horizontal months up to current period (Nov-26) and ensure members with early join dates are SEIMBANG', async () => {
      // Data anggota yang memiliki tanggal masuk di awal bulan (tanggal 1, 2, 3)
      const specialMembers = [
        { id: 'm-mulyadi', nrp: '101', nama: 'Mulyadi Utomo', created_at: '2021-05-01', tgl_awal_anggota: '2021-05-01', status: 'aktif' },
        { id: 'm-mulyono', nrp: '102', nama: 'Mulyono Santoso', created_at: '2021-05-02', tgl_awal_anggota: '2021-05-02', status: 'aktif' },
        { id: 'm-prabowo', nrp: '103', nama: 'Prabowo Hadi', created_at: '2021-05-03', tgl_awal_anggota: '2021-05-03', status: 'aktif' },
        { id: 'm-rian', nrp: '104', nama: 'Rian Firmansyah', created_at: '2021-05-01', tgl_awal_anggota: '2021-05-01', status: 'aktif' },
        { id: 'm-wawan', nrp: '105', nama: 'Wawan Gunawan', created_at: '2021-05-02', tgl_awal_anggota: '2021-05-02', status: 'aktif' }
      ];

      const belanjaTiers: SavingsRateTier[] = [
        {
          id: 'tier-sb',
          deposit_type_code: 'BELANJA',
          start_year: 2021,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 50000,
          notes: 'Tarif Belanja'
        }
      ];

      // Saldo acuan migrasi database 66 bulan = Rp 3.300.000
      const specialDeposits = specialMembers.map((m, idx) => ({
        id: `md-${idx}`,
        member_id: m.id,
        deposit_type_id: 'dt-belanja',
        deposit_types: { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja Bulanan' },
        deposit_transactions: [
          {
            id: `tx-${idx}`,
            amount: 3300000, // 66 bulan alokasi
            description: 'Saldo Awal Migrasi',
            transaction_type: 'deposit',
            for_month: null,
            for_year: null
          }
        ]
      }));

      // Ekspor tanpa menentukan endYear dan endMonth (menguji default deterministik ke bulan berjalan)
      const wb = await generateSavingsMatrixWorkbook({
        depositTypeCode: 'BELANJA',
        members: specialMembers,
        rateTiers: belanjaTiers,
        memberDeposits: specialDeposits,
        autoSave: false
      });

      const ws = wb.getWorksheet('Matriks BELANJA');
      expect(ws).toBeDefined();

      // Pastikan kolom bulan dimulai dari Mar-26 hingga Nov-26 tanpa kolom pra-Maret 2026
      const headerRow = ws!.getRow(1);
      const cellValues: string[] = [];
      headerRow.eachCell((cell) => {
        if (typeof cell.value === 'string') cellValues.push(cell.value);
      });

      expect(cellValues[3]).toBe('Saldo Awal (Per Mar-26)');
      expect(cellValues[4]).toBe('Mar-26');
      expect(cellValues).not.toContain('Mei-21');
      expect(cellValues).not.toContain('Feb-26');
      expect(cellValues).toContain('Nov-26');
      expect(cellValues).toContain('Total Saldo Akhir');
      expect(cellValues).toContain('Saldo Acuan Database');
      expect(cellValues).toContain('Selisih');
      expect(cellValues).toContain('Status Validasi');

      // Seluruh 5 anggota harus memiliki status validasi "SEIMBANG" dan selisih = 0
      const totalColIdx = cellValues.indexOf('Total Saldo Akhir') + 1;
      const dbColIdx = cellValues.indexOf('Saldo Acuan Database') + 1;
      const selisihColIdx = cellValues.indexOf('Selisih') + 1;
      const statusColIdx = cellValues.indexOf('Status Validasi') + 1;

      for (let r = 2; r <= 6; r++) {
        const row = ws!.getRow(r);
        const saldoAwal = row.getCell(4).value;
        const totalCell = row.getCell(totalColIdx);
        const dbCell = row.getCell(dbColIdx);
        const selisihCell = row.getCell(selisihColIdx);
        const statusCell = row.getCell(statusColIdx);

        expect(saldoAwal).toBe(3300000);
        expect(row.getCell(5).value).toBeNull(); // Mar-26 kosong siap diisi admin
        expect(totalCell.result).toBe(3300000);
        expect(dbCell.value).toBe(3300000);
        expect(selisihCell.result).toBe(0);
        expect(statusCell.result).toBe('SEIMBANG');
      }
    });
  });

  describe('exportSavingsMatrixExcel', () => {
    it('should trigger browser download with correct filename when autoSave is enabled', async () => {
      await exportSavingsMatrixExcel('WAJIB', {
        startYear: 2024,
        startMonth: 1,
        endYear: 2024,
        endMonth: 3,
        members: mockMembers,
        rateTiers: mockRateTiers,
        memberDeposits: mockMemberDeposits,
        autoSave: true
      });

      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toBe('periksa_simpanan_wajib.xlsx');
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should not trigger download if autoSave is false', async () => {
      await exportSavingsMatrixExcel('BELANJA', {
        startYear: 2024,
        startMonth: 1,
        endYear: 2024,
        endMonth: 3,
        members: mockMembers,
        rateTiers: mockRateTiers,
        memberDeposits: mockMemberDeposits,
        autoSave: false
      });

      expect(mockClick).not.toHaveBeenCalled();
    });
  });
});
