import { describe, it, expect } from 'vitest';
import {
  isPokokDepositType,
  getDepositTypeSortOrder,
  buildSavingsTemplateRows,
  MemberBatchItem,
  MemberDepositItem,
  DepositTypeItem,
  DepositTransactionItem,
} from './batchUpdateService';

describe('batchUpdateService - Conditional Pokok Logic & Template Generation', () => {
  describe('isPokokDepositType', () => {
    it('mengidentifikasi POKOK dari kode dan nama', () => {
      expect(isPokokDepositType({ code: 'POKOK' })).toBe(true);
      expect(isPokokDepositType({ code: 'SP' })).toBe(true);
      expect(isPokokDepositType({ code: 'pokok' })).toBe(true);
      expect(isPokokDepositType({ name: 'Simpanan Pokok Anggota' })).toBe(true);
      expect(isPokokDepositType({ code: 'WAJIB', name: 'Simpanan Wajib' })).toBe(false);
      expect(isPokokDepositType({ code: 'BELANJA' })).toBe(false);
      expect(isPokokDepositType(null)).toBe(false);
      expect(isPokokDepositType(undefined)).toBe(false);
    });
  });

  describe('getDepositTypeSortOrder', () => {
    it('mengurutkan sesuai prioritas: WAJIB (1), LEBARAN (2), BELANJA (3), Lainnya (10)', () => {
      expect(getDepositTypeSortOrder({ code: 'WAJIB' })).toBe(1);
      expect(getDepositTypeSortOrder({ code: 'SW' })).toBe(1);
      expect(getDepositTypeSortOrder({ code: 'LEBARAN' })).toBe(2);
      expect(getDepositTypeSortOrder({ code: 'SL' })).toBe(2);
      expect(getDepositTypeSortOrder({ name: 'Simpanan Hari Raya' })).toBe(2);
      expect(getDepositTypeSortOrder({ code: 'BELANJA' })).toBe(3);
      expect(getDepositTypeSortOrder({ code: 'SB' })).toBe(3);
      expect(getDepositTypeSortOrder({ code: 'SUKARELA' })).toBe(10);
      expect(getDepositTypeSortOrder(null)).toBe(99);
    });
  });

  describe('buildSavingsTemplateRows', () => {
    const mockDepositTypes: DepositTypeItem[] = [
      { id: 'dt-pokok', code: 'POKOK', name: 'Simpanan Pokok', default_amount: 100000, frequency_type: 'one_time' },
      { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib', default_amount: 200000, frequency_type: 'monthly' },
      { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Hari Raya', default_amount: 50000, frequency_type: 'monthly' },
      { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja', default_amount: 25000, frequency_type: 'monthly' },
    ];

    it('menghasilkan HANYA 3 baris (WAJIB, LEBARAN, BELANJA) untuk anggota yang Simpanan Pokoknya sudah lunas', () => {
      const memberA: MemberBatchItem = {
        id: 'm-1',
        nrp: '10001',
        nama: 'Budi Santoso',
        bank_account_number: '1234567890',
        status: 'aktif',
      };

      const deposits: MemberDepositItem[] = [
        { id: 'dep-p-1', member_id: 'm-1', deposit_types: mockDepositTypes[0] }, // POKOK
        { id: 'dep-w-1', member_id: 'm-1', deposit_types: mockDepositTypes[1] }, // WAJIB
        { id: 'dep-l-1', member_id: 'm-1', deposit_types: mockDepositTypes[2] }, // LEBARAN
        { id: 'dep-b-1', member_id: 'm-1', deposit_types: mockDepositTypes[3] }, // BELANJA
      ];

      // Pokok sudah disetor 100.000 (target: 100.000)
      const allPokokTxs: DepositTransactionItem[] = [
        { member_deposit_id: 'dep-p-1', amount: 100000, transaction_type: 'deposit' },
      ];

      const rows = buildSavingsTemplateRows(
        [memberA],
        deposits,
        mockDepositTypes,
        [], // belum ada bayar bulan ini
        allPokokTxs,
        100000,
        11,
        2026
      );

      expect(rows).toHaveLength(3);
      expect(rows.map(r => r.kode_simpanan)).toEqual(['WAJIB', 'LEBARAN', 'BELANJA']);
      expect(rows[0].nrp).toBe('10001');
      expect(rows[0].kode_simpanan).toBe('WAJIB');
      expect(rows[0].telah_dibayar).toBe(0);
      expect(rows[0].jumlah_bayar).toBe(200000);

      expect(rows[1].kode_simpanan).toBe('LEBARAN');
      expect(rows[1].jumlah_bayar).toBe(50000);

      expect(rows[2].kode_simpanan).toBe('BELANJA');
      expect(rows[2].jumlah_bayar).toBe(25000);
    });

    it('menghasilkan 4 baris termasuk baris POKOK untuk anggota yang Simpanan Pokoknya belum pernah disetor', () => {
      const memberB: MemberBatchItem = {
        id: 'm-2',
        nrp: '10002',
        nama: 'Siti Aminah',
        bank_account_number: '9876543210',
        status: 'aktif',
      };

      const deposits: MemberDepositItem[] = [
        { id: 'dep-p-2', member_id: 'm-2', deposit_types: mockDepositTypes[0] }, // POKOK
        { id: 'dep-w-2', member_id: 'm-2', deposit_types: mockDepositTypes[1] }, // WAJIB
        { id: 'dep-l-2', member_id: 'm-2', deposit_types: mockDepositTypes[2] }, // LEBARAN
        { id: 'dep-b-2', member_id: 'm-2', deposit_types: mockDepositTypes[3] }, // BELANJA
      ];

      // Tidak ada riwayat transaksi pokok
      const allPokokTxs: DepositTransactionItem[] = [];

      const rows = buildSavingsTemplateRows(
        [memberB],
        deposits,
        mockDepositTypes,
        [],
        allPokokTxs,
        100000,
        11,
        2026
      );

      expect(rows).toHaveLength(4);
      expect(rows.map(r => r.kode_simpanan)).toEqual(['WAJIB', 'LEBARAN', 'BELANJA', 'POKOK']);

      const pokokRow = rows[3];
      expect(pokokRow.nrp).toBe('10002');
      expect(pokokRow.nama).toBe('Siti Aminah');
      expect(pokokRow.nomor_rekening).toBe('9876543210');
      expect(pokokRow.bulan).toBe(11);
      expect(pokokRow.tahun).toBe(2026);
      expect(pokokRow.kode_simpanan).toBe('POKOK');
      expect(pokokRow.telah_dibayar).toBe(0);
      expect(pokokRow.jumlah_bayar).toBe(100000);
    });

    it('menghitung sisa tagihan pokok secara akurat jika anggota baru mencicil sebagian pokok', () => {
      const memberC: MemberBatchItem = {
        id: 'm-3',
        nrp: '10003',
        nama: 'Ahmad Fauzi',
        bank_account_number: '5551234567',
        status: 'aktif',
      };

      const deposits: MemberDepositItem[] = [
        { id: 'dep-p-3', member_id: 'm-3', deposit_types: mockDepositTypes[0] }, // POKOK
        { id: 'dep-w-3', member_id: 'm-3', deposit_types: mockDepositTypes[1] }, // WAJIB
        { id: 'dep-l-3', member_id: 'm-3', deposit_types: mockDepositTypes[2] }, // LEBARAN
        { id: 'dep-b-3', member_id: 'm-3', deposit_types: mockDepositTypes[3] }, // BELANJA
      ];

      // Anggota sudah bayar 40.000 dari total 100.000 target pokok
      const allPokokTxs: DepositTransactionItem[] = [
        { member_deposit_id: 'dep-p-3', amount: 40000, transaction_type: 'deposit' },
      ];

      const rows = buildSavingsTemplateRows(
        [memberC],
        deposits,
        mockDepositTypes,
        [],
        allPokokTxs,
        100000,
        11,
        2026
      );

      expect(rows).toHaveLength(4);
      const pokokRow = rows[3];
      expect(pokokRow.kode_simpanan).toBe('POKOK');
      expect(pokokRow.telah_dibayar).toBe(40000);
      expect(pokokRow.jumlah_bayar).toBe(60000); // 100.000 - 40.000
    });

    it('mengelompokkan baris per anggota secara berurutan dan konsisten untuk multi-anggota', () => {
      const memberLunas: MemberBatchItem = {
        id: 'm-lunas',
        nrp: '001',
        nama: 'Member Lunas',
        bank_account_number: 'rek-1',
      };
      const memberBelumLunas: MemberBatchItem = {
        id: 'm-belum',
        nrp: '002',
        nama: 'Member Belum Lunas',
        bank_account_number: 'rek-2',
      };

      const deposits: MemberDepositItem[] = [
        // Member Lunas
        { id: 'dep-p-1', member_id: 'm-lunas', deposit_types: mockDepositTypes[0] },
        { id: 'dep-w-1', member_id: 'm-lunas', deposit_types: mockDepositTypes[1] },
        { id: 'dep-l-1', member_id: 'm-lunas', deposit_types: mockDepositTypes[2] },
        { id: 'dep-b-1', member_id: 'm-lunas', deposit_types: mockDepositTypes[3] },
        // Member Belum Lunas
        { id: 'dep-p-2', member_id: 'm-belum', deposit_types: mockDepositTypes[0] },
        { id: 'dep-w-2', member_id: 'm-belum', deposit_types: mockDepositTypes[1] },
        { id: 'dep-l-2', member_id: 'm-belum', deposit_types: mockDepositTypes[2] },
        { id: 'dep-b-2', member_id: 'm-belum', deposit_types: mockDepositTypes[3] },
      ];

      const allPokokTxs: DepositTransactionItem[] = [
        { member_deposit_id: 'dep-p-1', amount: 100000, transaction_type: 'deposit' }, // Lunas
        { member_deposit_id: 'dep-p-2', amount: 25000, transaction_type: 'deposit' },  // Belum lunas
      ];

      const rows = buildSavingsTemplateRows(
        [memberLunas, memberBelumLunas],
        deposits,
        mockDepositTypes,
        [],
        allPokokTxs,
        100000,
        11,
        2026
      );

      // Member Lunas: 3 baris
      // Member Belum Lunas: 4 baris
      // Total: 7 baris
      expect(rows).toHaveLength(7);

      // 3 baris pertama milik Member Lunas
      expect(rows[0].nrp).toBe('001');
      expect(rows[0].kode_simpanan).toBe('WAJIB');
      expect(rows[1].nrp).toBe('001');
      expect(rows[1].kode_simpanan).toBe('LEBARAN');
      expect(rows[2].nrp).toBe('001');
      expect(rows[2].kode_simpanan).toBe('BELANJA');

      // 4 baris berikutnya milik Member Belum Lunas
      expect(rows[3].nrp).toBe('002');
      expect(rows[3].kode_simpanan).toBe('WAJIB');
      expect(rows[4].nrp).toBe('002');
      expect(rows[4].kode_simpanan).toBe('LEBARAN');
      expect(rows[5].nrp).toBe('002');
      expect(rows[5].kode_simpanan).toBe('BELANJA');
      expect(rows[6].nrp).toBe('002');
      expect(rows[6].kode_simpanan).toBe('POKOK');
      expect(rows[6].telah_dibayar).toBe(25000);
      expect(rows[6].jumlah_bayar).toBe(75000);
    });

    it('memperhitungkan pembayaran simpanan rutin yang sudah dibayar pada bulan bersangkutan', () => {
      const member: MemberBatchItem = {
        id: 'm-1',
        nrp: '10001',
        nama: 'Budi Santoso',
      };

      const deposits: MemberDepositItem[] = [
        { id: 'dep-p-1', member_id: 'm-1', deposit_types: mockDepositTypes[0] },
        { id: 'dep-w-1', member_id: 'm-1', deposit_types: mockDepositTypes[1] },
        { id: 'dep-l-1', member_id: 'm-1', deposit_types: mockDepositTypes[2] },
        { id: 'dep-b-1', member_id: 'm-1', deposit_types: mockDepositTypes[3] },
      ];

      const txsForMonth: DepositTransactionItem[] = [
        { member_deposit_id: 'dep-w-1', amount: 50000, transaction_type: 'deposit' }, // bayar 50rb dari 200rb
        { member_deposit_id: 'dep-l-1', amount: 50000, transaction_type: 'deposit' }, // bayar lunas 50rb dari 50rb
      ];

      const rows = buildSavingsTemplateRows(
        [member],
        deposits,
        mockDepositTypes,
        txsForMonth,
        [{ member_deposit_id: 'dep-p-1', amount: 100000, transaction_type: 'deposit' }], // pokok lunas
        100000,
        11,
        2026
      );

      expect(rows).toHaveLength(3);
      // WAJIB: telah dibayar 50.000, sisa 150.000
      expect(rows[0].kode_simpanan).toBe('WAJIB');
      expect(rows[0].telah_dibayar).toBe(50000);
      expect(rows[0].jumlah_bayar).toBe(150000);

      // LEBARAN: telah dibayar 50.000, sisa 0
      expect(rows[1].kode_simpanan).toBe('LEBARAN');
      expect(rows[1].telah_dibayar).toBe(50000);
      expect(rows[1].jumlah_bayar).toBe(0);

      // BELANJA: belum dibayar, sisa 25.000
      expect(rows[2].kode_simpanan).toBe('BELANJA');
      expect(rows[2].telah_dibayar).toBe(0);
      expect(rows[2].jumlah_bayar).toBe(25000);
    });

    it('memberikan fallback 3 baris simpanan standar jika anggota belum terdaftar memiliki rekening member_deposits rutin', () => {
      const memberFresh: MemberBatchItem = {
        id: 'm-fresh',
        nrp: '99999',
        nama: 'Anggota Baru',
      };

      const rows = buildSavingsTemplateRows(
        [memberFresh],
        [], // belum ada rekening member_deposits sama sekali
        mockDepositTypes,
        [],
        [],
        100000,
        11,
        2026
      );

      // 3 simpanan standar + 1 pokok (karena belum lunas) = 4 baris
      expect(rows).toHaveLength(4);
      expect(rows.map(r => r.kode_simpanan)).toEqual(['WAJIB', 'LEBARAN', 'BELANJA', 'POKOK']);
      expect(rows[3].kode_simpanan).toBe('POKOK');
      expect(rows[3].telah_dibayar).toBe(0);
      expect(rows[3].jumlah_bayar).toBe(100000);
    });
  });
});
