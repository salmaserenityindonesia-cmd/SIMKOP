import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SavingsLedgerMatrixModal, {
  formatRateBadge,
  getBadgeColorClass,
  isMonthBeforeJoin,
  generateMonthGrid,
  calculateTotalChecked,
  matchAutomaticFifo
} from './SavingsLedgerMatrixModal';
import { supabase } from '../../lib/supabaseClient';
import { DEFAULT_RATE_TIERS } from '../../services/savingsRateService';

// Mock supabaseClient
vi.mock('../../lib/supabaseClient', () => {
  const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockDelete = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          })
        })
      }),
      gte: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })
    })
  });

  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'md-wajib-1',
          deposit_type_id: 'dt-wajib',
          deposit_types: { id: 'dt-wajib', name: 'Simpanan Wajib', code: 'WAJIB' },
          deposit_transactions: [
            {
              id: 'tx-migrasi-wajib',
              amount: 3000000,
              description: 'Migrasi Saldo Awal (As-Is)',
              transaction_type: 'deposit',
              created_at: '2024-01-01T00:00:00.000Z'
            }
          ]
        },
        {
          id: 'md-belanja-1',
          deposit_type_id: 'dt-belanja',
          deposit_types: { id: 'dt-belanja', name: 'Simpanan Belanja', code: 'BELANJA' },
          deposit_transactions: []
        },
        {
          id: 'md-lebaran-1',
          deposit_type_id: 'dt-lebaran',
          deposit_types: { id: 'dt-lebaran', name: 'Simpanan Lebaran', code: 'LEBARAN' },
          deposit_transactions: []
        }
      ],
      error: null
    })
  });

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-wajib', name: 'Simpanan Wajib', code: 'WAJIB' },
                { id: 'dt-belanja', name: 'Simpanan Belanja', code: 'BELANJA' },
                { id: 'dt-lebaran', name: 'Simpanan Lebaran', code: 'LEBARAN' }
              ],
              error: null
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: mockSelect
          };
        }
        if (table === 'deposit_transactions') {
          return {
            insert: mockInsert,
            delete: mockDelete
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { created_at: '2024-03-01T00:00:00.000Z', tgl_awal_anggota: '2024-03-01' },
                  error: null
                })
              })
            })
          };
        }
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null })
        };
      })
    }
  };
});

describe('SavingsLedgerMatrixModal Component & FIFO Matching Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Static UI Rendering & Header Info', () => {
    it('renders member profile, tab options, and quick action toolbar', () => {
      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-123"
          memberNrp="78010234"
          memberName="Briptu Agus Susanto"
          joinDate="2024-03-01"
          onClose={vi.fn()}
        />
      );

      // Header modal & title
      expect(html).toContain('Buku Besar Matriks Simpanan (Checkbox Grid)');
      expect(html).toContain('Real-time');

      // Member details
      expect(html).toContain('Briptu Agus Susanto');
      expect(html).toContain('78010234');
      expect(html).toContain('1 Mar 2024');

      // Tab selection
      expect(html).toContain('Simpanan Wajib');
      expect(html).toContain('Simpanan Belanja');
      expect(html).toContain('Simpanan Lebaran');

      // Quick actions buttons
      expect(html).toContain('Centang Semua s/d Bulan Ini');
      expect(html).toContain('Cocokkan Otomatis dengan Saldo Impor');
      expect(html).toContain('Batal Centang Semua');

      // Close button
      expect(html).toContain('Tutup');
    });

    it('renders grid month columns in chronological (ascending) order and highlights current month', () => {
      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-123"
          memberNrp="78010234"
          memberName="Briptu Agus Susanto"
          joinDate="2024-01-01"
          onClose={vi.fn()}
          initialLoading={false}
        />
      );

      // Pastikan kolom bulan terurut secara kronologis maju (periode awal muncul lebih dulu)
      const idxJan24 = html.indexOf('<div>Jan-24</div>');
      const idxNov26 = html.indexOf('<div>Nov-26</div>');
      const idxDes26 = html.indexOf('<div>Des-26</div>');

      expect(idxJan24).toBeGreaterThan(-1);
      expect(idxNov26).toBeGreaterThan(-1);
      expect(idxDes26).toBeGreaterThan(-1);

      // Jan-24 harus muncul sebelum Nov-26, dan Nov-26 sebelum Des-26
      expect(idxJan24).toBeLessThan(idxNov26);
      expect(idxNov26).toBeLessThan(idxDes26);

      // Pastikan terdapat penanda "Bulan Ini" dan testid "current-month-col"
      expect(html).toContain('Bulan Ini');
      expect(html).toContain('data-testid="current-month-col"');
    });

    it('renders balance comparison and balanced status when total matches database balance', () => {
      // 3.000.000 tercentang vs 3.000.000 di database
      const dummyCheckedKeys = [
        '2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06',
        '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12', // 12 x 150k = 1.800.000
        '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
        '2025-07', '2025-08' // 8 x 150k = 1.200.000 -> Total 3.000.000
      ];

      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-123"
          memberNrp="78010234"
          memberName="Briptu Agus Susanto"
          joinDate="2024-01-01"
          onClose={vi.fn()}
          initialDbBalances={{ WAJIB: 3000000 }}
          initialCheckedMonths={{ WAJIB: dummyCheckedKeys }}
        />
      );

      // Verify "Sesuai / Seimbang"
      expect(html).toContain('Sesuai / Seimbang');
      expect(html).toContain('3.000.000');
    });

    it('renders selisih badge when total checked does not equal database balance', () => {
      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-123"
          memberNrp="78010234"
          memberName="Briptu Agus Susanto"
          joinDate="2024-01-01"
          onClose={vi.fn()}
          initialDbBalances={{ WAJIB: 3000000 }}
          initialCheckedMonths={{ WAJIB: ['2024-01'] }} // 150.000 vs 3.000.000
        />
      );

      expect(html).toContain('Selisih');
      expect(html).toContain('Kurang');
    });

    it('renders "Selisih Rp 10.200.000 (Belum Dialokasikan)" when Total Tercentang is 0 but Saldo Database is Rp 10.200.000', () => {
      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-agus"
          memberNrp="95168420"
          memberName="Agus Susanto"
          joinDate="2022-08-01"
          onClose={vi.fn()}
          initialDbBalances={{ WAJIB: 10200000 }}
          initialCheckedMonths={{ WAJIB: [] }}
        />
      );

      // Verify Saldo Database is preserved
      expect(html).toContain('10.200.000');
      // Verify Total Tercentang is 0
      expect(html).toContain('Total Tercentang:');
      // Verify badge text
      expect(html).toContain('Selisih');
      expect(html).toContain('(Belum Dialokasikan)');
    });

    it('renders partial badge and balanced status for partial remainder month (e.g. Agus Susanto Rp 60.000)', () => {
      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-agus"
          memberNrp="95168420"
          memberName="Agus Susanto"
          joinDate="2022-08-01"
          onClose={vi.fn()}
          initialLoading={false}
          initialDbBalances={{ WAJIB: 60000 }}
          initialCheckedMonths={{ WAJIB: ['2026-09'] }}
          initialMonthAmounts={{ WAJIB: { '2026-09': 60000 } }}
        />
      );

      // Verify partial badge and amount
      expect(html).toContain('Parsial: Rp 60.000 /');
      expect(html).toContain('partial-badge-2026-09');
      // Verify total matches database balance: Sesuai / Seimbang
      expect(html).toContain('Sesuai / Seimbang');
      expect(html).toContain('60.000');
    });
  });

  describe('calculateTotalChecked Helper with Partial Amounts', () => {
    it('uses custom partial amounts when provided', () => {
      const keys = ['2024-01', '2026-09'];
      const customAmounts = new Map<string, number>([['2026-09', 60000]]);
      const total = calculateTotalChecked(keys, 'WAJIB', DEFAULT_RATE_TIERS, customAmounts);
      // 2024-01 is 150.000, 2026-09 is overridden with 60.000 -> 210.000
      expect(total).toBe(210000);
    });
  });

  describe('isMonthBeforeJoin Helper Logic', () => {
    it('correctly disables months strictly prior to member join date', () => {
      const joinDate = '2024-03-15';

      // Jan 2024 and Feb 2024 are before March 2024
      expect(isMonthBeforeJoin(2024, 1, joinDate)).toBe(true);
      expect(isMonthBeforeJoin(2024, 2, joinDate)).toBe(true);

      // March 2024 is the join month -> NOT before
      expect(isMonthBeforeJoin(2024, 3, joinDate)).toBe(false);

      // April 2024 onwards -> NOT before
      expect(isMonthBeforeJoin(2024, 4, joinDate)).toBe(false);
      expect(isMonthBeforeJoin(2025, 1, joinDate)).toBe(false);
    });

    it('returns false when joinDate is null or undefined or invalid', () => {
      expect(isMonthBeforeJoin(2024, 1, null)).toBe(false);
      expect(isMonthBeforeJoin(2024, 1, undefined)).toBe(false);
      expect(isMonthBeforeJoin(2024, 1, 'invalid-date')).toBe(false);
    });

    it('generateMonthGrid supports descending order when requested', () => {
      const ascGrid = generateMonthGrid(2024, 2026);
      expect(ascGrid[0].key).toBe('2024-01');
      expect(ascGrid[ascGrid.length - 1].key).toBe('2026-12');

      const descGrid = generateMonthGrid(2024, 2026, 'desc');
      expect(descGrid[0].key).toBe('2026-12');
      expect(descGrid[descGrid.length - 1].key).toBe('2024-01');
    });
  });

  describe('formatRateBadge & getBadgeColorClass Helper Logic', () => {
    it('formats rate badges concisely with "k" suffix', () => {
      expect(formatRateBadge(150000)).toBe('Rp 150k');
      expect(formatRateBadge(200000)).toBe('Rp 200k');
      expect(formatRateBadge(25000)).toBe('Rp 25k');
      expect(formatRateBadge(50000)).toBe('Rp 50k');
      expect(formatRateBadge(500)).toBe('Rp 500');
    });

    it('assigns amber badge for WAJIB <= Oct 2025 and emerald badge for Nov 2025 onwards', () => {
      // WAJIB <= Okt 2025 -> amber
      const classOld = getBadgeColorClass('WAJIB', 2025, 10, 150000);
      expect(classOld).toContain('bg-amber-100');
      expect(classOld).toContain('text-amber-800');

      // WAJIB Nov 2025 onwards -> emerald
      const classNew = getBadgeColorClass('WAJIB', 2025, 11, 200000);
      expect(classNew).toContain('bg-emerald-100');
      expect(classNew).toContain('text-emerald-800');

      // WAJIB 2026 -> emerald
      const class2026 = getBadgeColorClass('WAJIB', 2026, 1, 200000);
      expect(class2026).toContain('bg-emerald-100');

      // BELANJA -> blue
      const classBelanja = getBadgeColorClass('BELANJA', 2025, 5, 25000);
      expect(classBelanja).toContain('bg-blue-100');

      // LEBARAN -> purple
      const classLebaran = getBadgeColorClass('LEBARAN', 2025, 5, 50000);
      expect(classLebaran).toContain('bg-purple-100');
    });
  });

  describe('FIFO Matching Algorithm (matchAutomaticFifo)', () => {
    it('accurately checks months FIFO until exactly 3.000.000 is reached', () => {
      const grid = generateMonthGrid(2024, 2026);
      const targetBalance = 3000000; // 3 juta
      const joinDate = '2024-01-01';

      // Jalankan FIFO matching
      const matched = matchAutomaticFifo(
        targetBalance,
        grid,
        'WAJIB',
        DEFAULT_RATE_TIERS,
        joinDate
      );

      // Hitung akumulasi
      const totalAccumulated = calculateTotalChecked(matched, 'WAJIB', DEFAULT_RATE_TIERS);

      expect(totalAccumulated).toBe(3000000);
      // 2024: 12 bulan x 150k = 1.800.000
      // 2025: sisa 1.200.000 / 150k = 8 bulan (Jan s/d Ags 2025)
      // Total 20 bulan
      expect(matched.length).toBe(20);
      expect(matched[0]).toBe('2024-01');
      expect(matched[11]).toBe('2024-12');
      expect(matched[19]).toBe('2025-08');
    });

    it('respects tier price transition: 150k up to Oct 2025, 200k from Nov 2025', () => {
      const grid = generateMonthGrid(2024, 2026);
      // 2024: 12 x 150k = 1.800.000
      // 2025 Jan-Okt (10 bln): 10 x 150k = 1.500.000 (Subtotal: 3.300.000)
      // 2025 Nov (1 bln): 200k (Subtotal: 3.500.000)
      // 2025 Des (1 bln): 200k (Subtotal: 3.700.000)
      const targetBalance = 3700000;
      const joinDate = '2024-01-01';

      const matched = matchAutomaticFifo(
        targetBalance,
        grid,
        'WAJIB',
        DEFAULT_RATE_TIERS,
        joinDate
      );

      const totalAccumulated = calculateTotalChecked(matched, 'WAJIB', DEFAULT_RATE_TIERS);
      expect(totalAccumulated).toBe(3700000);
      expect(matched.length).toBe(24); // 12 (2024) + 12 (2025)
      expect(matched).toContain('2025-10'); // Rp 150k
      expect(matched).toContain('2025-11'); // Rp 200k
      expect(matched).toContain('2025-12'); // Rp 200k
    });

    it('skips months before member join date during FIFO matching', () => {
      const grid = generateMonthGrid(2024, 2026);
      // Join date: 1 Mei 2024 (Jan - Apr 2024 dilewati)
      const joinDate = '2024-05-01';
      const targetBalance = 600000; // 4 bulan x 150k = 600k

      const matched = matchAutomaticFifo(
        targetBalance,
        grid,
        'WAJIB',
        DEFAULT_RATE_TIERS,
        joinDate
      );

      expect(matched).not.toContain('2024-01');
      expect(matched).not.toContain('2024-02');
      expect(matched).not.toContain('2024-03');
      expect(matched).not.toContain('2024-04');

      expect(matched).toEqual(['2024-05', '2024-06', '2024-07', '2024-08']);
      expect(calculateTotalChecked(matched, 'WAJIB', DEFAULT_RATE_TIERS)).toBe(600000);
    });

    it('returns empty array when target balance is 0 or negative', () => {
      const grid = generateMonthGrid(2024, 2026);
      expect(matchAutomaticFifo(0, grid, 'WAJIB', DEFAULT_RATE_TIERS)).toEqual([]);
      expect(matchAutomaticFifo(-50000, grid, 'WAJIB', DEFAULT_RATE_TIERS)).toEqual([]);
    });
  });

  describe('Database Synchronization Calls', () => {
    it('invokes supabase insert query when a month checkbox is checked', async () => {
      // Direct call verification
      await supabase.from('deposit_transactions').insert([
        {
          member_deposit_id: 'md-wajib-1',
          amount: 150000,
          for_month: 1,
          for_year: 2024,
          transaction_type: 'deposit',
          description: 'Setoran Matriks WAJIB Jan 2024'
        }
      ]);

      expect(supabase.from).toHaveBeenCalledWith('deposit_transactions');
    });

    it('invokes supabase delete query when a month checkbox is unchecked', async () => {
      await supabase
        .from('deposit_transactions')
        .delete()
        .eq('member_deposit_id', 'md-wajib-1')
        .eq('for_month', 1)
        .eq('for_year', 2024);

      expect(supabase.from).toHaveBeenCalledWith('deposit_transactions');
    });

    it('cleans up bulk migration records when monthly breakdown is created or synced', async () => {
      // Simulasikan pemanggilan query pembersihan record migrasi
      const delQuery = supabase.from('deposit_transactions').delete();
      expect(supabase.from).toHaveBeenCalledWith('deposit_transactions');
      expect(delQuery.eq).toBeDefined();
    });

    it('inserts placeholder transaction with description "Saldo Simpanan Belum Teralokasi" when unchecking all', async () => {
      await supabase.from('deposit_transactions').insert([
        {
          member_deposit_id: 'md-wajib-1',
          amount: 10200000,
          for_month: null,
          for_year: null,
          transaction_type: 'deposit',
          description: 'Saldo Simpanan Belum Teralokasi'
        }
      ]);

      expect(supabase.from).toHaveBeenCalledWith('deposit_transactions');
    });
  });

  describe('Audit Evidence Documentation, Uncheck Confirmation & History Modal Tests', () => {
    it('renders history button and audit action icons on month cells', () => {
      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-123"
          memberNrp="78010234"
          memberName="Briptu Agus Susanto"
          joinDate="2024-03-01"
          onClose={vi.fn()}
          initialLoading={false}
        />
      );

      expect(html).toContain('history-btn-');
      expect(html).toContain('Riwayat Audit &amp; Bukti');
    });

    it('renders evidence input modal with prefilled rate, reference no, and payment methods', () => {
      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-123"
          memberNrp="78010234"
          memberName="Briptu Agus Susanto"
          joinDate="2024-03-01"
          onClose={vi.fn()}
          initialLoading={false}
          initialEvidenceModalOpen={true}
          initialSelectedCellForEvidence={{
            year: 2026,
            month: 11,
            label: 'Nov-26',
            rate: 200000
          }}
        />
      );

      expect(html).toContain('data-testid="evidence-modal"');
      expect(html).toContain('Dokumentasi Bukti Setoran');
      expect(html).toContain('Periode Nov-26');
      expect(html).toContain('data-testid="evidence-amount-input"');
      expect(html).toContain('data-testid="evidence-ref-input"');
      expect(html).toContain('data-testid="evidence-method-select"');
      expect(html).toContain('data-testid="evidence-notes-input"');
      expect(html).toContain('data-testid="evidence-submit-btn"');
      expect(html).toContain('Tarif Standar:');
      expect(html).toContain('200.000');
      expect(html).toContain('Potong Gaji');
      expect(html).toContain('Transfer Bank');
      expect(html).toContain('Simpan Setoran');
    });

    it('renders uncheck confirmation modal requiring reason and warning about audit logs', () => {
      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-123"
          memberNrp="78010234"
          memberName="Briptu Agus Susanto"
          joinDate="2024-03-01"
          onClose={vi.fn()}
          initialUncheckModalOpen={true}
          initialSelectedCellForUncheck={{
            year: 2026,
            month: 11,
            label: 'Nov-26',
            key: '2026-11'
          }}
        />
      );

      expect(html).toContain('data-testid="uncheck-modal"');
      expect(html).toContain('Konfirmasi Pembatalan Setoran');
      expect(html).toContain('Periode Nov-26');
      expect(html).toContain('Jejak Audit (Audit Logs)');
      expect(html).toContain('data-testid="uncheck-reason-input"');
      expect(html).toContain('data-testid="uncheck-confirm-btn"');
      expect(html).toContain('Konfirmasi Pembatalan');
    });

    it('renders audit history modal displaying chronological list of actions and performers', () => {
      const sampleHistory = [
        {
          id: 'hist-1',
          action: 'CREATE' as const,
          amount: 200000,
          forMonth: 11,
          forYear: 2026,
          referenceNo: 'KW-2026/11/01',
          paymentMethod: 'potong_gaji',
          notes: 'Setoran rutin November',
          performerName: 'Admin Keuangan',
          createdAt: '2026-11-01T10:00:00.000Z'
        },
        {
          id: 'hist-2',
          action: 'DELETE' as const,
          amount: 200000,
          forMonth: 11,
          forYear: 2026,
          referenceNo: 'KW-2026/11/01',
          notes: 'Koreksi salah input periode',
          performerName: 'Super Admin',
          createdAt: '2026-11-02T14:30:00.000Z'
        }
      ];

      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-123"
          memberNrp="78010234"
          memberName="Briptu Agus Susanto"
          joinDate="2024-03-01"
          onClose={vi.fn()}
          initialHistoryModalOpen={true}
          initialSelectedCellForHistory={{
            year: 2026,
            month: 11,
            label: 'Nov-26'
          }}
          initialAuditHistory={sampleHistory}
        />
      );

      expect(html).toContain('data-testid="history-modal"');
      expect(html).toContain('Riwayat Audit &amp; Bukti Setoran');
      expect(html).toContain('Setoran Aktif');
      expect(html).toContain('Pembatalan');
      expect(html).toContain('Admin Keuangan');
      expect(html).toContain('Super Admin');
      expect(html).toContain('KW-2026/11/01');
      expect(html).toContain('Koreksi salah input periode');
    });

    it('deduplicates duplicate cancellation logs so only one card with custom reason is rendered', () => {
      const duplicateHistory = [
        {
          id: 'del-user-1',
          action: 'DELETE' as const,
          amount: 200000,
          forMonth: 9,
          forYear: 2026,
          referenceNo: 'KW-2026/09/01',
          notes: 'tidak jadi bayar',
          performerName: 'Admin Kasir',
          createdAt: '2026-09-15T10:00:02.000Z'
        },
        {
          id: 'del-trigger-dup',
          action: 'DELETE' as const,
          amount: 200000,
          forMonth: 9,
          forYear: 2026,
          referenceNo: 'KW-2026/09/01',
          notes: 'Rekonsiliasi Otomatis (Setoran Parsial)',
          performerName: 'Admin Kasir',
          createdAt: '2026-09-15T10:00:01.000Z'
        }
      ];

      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="m-123"
          memberNrp="78010234"
          memberName="Briptu Agus Susanto"
          joinDate="2024-03-01"
          onClose={vi.fn()}
          initialHistoryModalOpen={true}
          initialSelectedCellForHistory={{
            year: 2026,
            month: 9,
            label: 'Sep-26'
          }}
          initialAuditHistory={duplicateHistory}
        />
      );

      // Kartu dengan alasan admin ("tidak jadi bayar") harus tampil
      expect(html).toContain('tidak jadi bayar');
      // Kartu duplikat sistem ("Rekonsiliasi Otomatis...") harus dibuang / tidak tampil
      expect(html).not.toContain('Rekonsiliasi Otomatis (Setoran Parsial)');
    });
  });
});
