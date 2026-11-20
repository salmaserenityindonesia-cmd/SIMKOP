import { describe, it, expect } from 'vitest';
import {
  MEMBER_CLEARANCE_CATEGORY,
  deduplicateClearanceRowsInMemory,
  descriptionContainsClearanceMemberNrp,
  extractNrpFromClearanceDescription,
  formatMemberClearanceCashFlowDescription,
  isClearanceLoanRepayment,
  isClearanceWithdrawalTx,
  isMemberClearanceCategory,
  isResignedMemberRecord,
  partitionDuplicateClearanceRows,
  stripResignedNrpPrefix,
} from './clearanceCashFlowFormat';

describe('clearanceCashFlowFormat', () => {
  it('recognizes KLIRING_ANGGOTA_KELUAR category case-insensitively and with spaces', () => {
    expect(MEMBER_CLEARANCE_CATEGORY).toBe('KLIRING_ANGGOTA_KELUAR');
    expect(isMemberClearanceCategory('KLIRING_ANGGOTA_KELUAR')).toBe(true);
    expect(isMemberClearanceCategory('kliring_anggota_keluar')).toBe(true);
    expect(isMemberClearanceCategory('Kliring Anggota Keluar')).toBe(true);
    expect(isMemberClearanceCategory('penarikan_simpanan')).toBe(false);
    expect(isMemberClearanceCategory(null)).toBe(false);
  });

  it('strips resigned (lama X) prefix from NRP cleanly', () => {
    expect(stripResignedNrpPrefix('(lama 1) 00010062')).toBe('00010062');
    expect(stripResignedNrpPrefix(' (LAMA 12)  88010001 ')).toBe('88010001');
    expect(stripResignedNrpPrefix('00010062')).toBe('00010062');
    expect(stripResignedNrpPrefix(null)).toBe('');
  });

  it('distinguishes resigned members from suspended, blocked, and pending_resigned members', () => {
    expect(isResignedMemberRecord({ status: 'nonaktif', membership_status: 'RESIGNED' })).toBe(true);
    expect(isResignedMemberRecord({ status: 'keluar', membership_status: 'ACTIVE' })).toBe(true);
    expect(isResignedMemberRecord({ status: 'nonaktif', membership_status: null })).toBe(true);
    expect(isResignedMemberRecord({ status: 'nonaktif', membership_status: 'SUSPENDED' })).toBe(false);
    expect(isResignedMemberRecord({ status: 'nonaktif', membership_status: 'BLOCKED' })).toBe(false);
    expect(isResignedMemberRecord({ status: 'aktif', membership_status: 'PENDING_RESIGNED' })).toBe(false);
    expect(isResignedMemberRecord({ status: 'aktif', membership_status: 'ACTIVE' })).toBe(false);
    expect(isResignedMemberRecord(null)).toBe(false);
  });

  it('identifies clearance withdrawal transactions and clearance loan repayments', () => {
    expect(
      isClearanceWithdrawalTx({
        transaction_type: 'withdrawal',
        description: 'Pencairan Kliring Pengunduran Diri',
      })
    ).toBe(true);
    expect(
      isClearanceWithdrawalTx({
        transaction_type: 'withdrawal',
        reference_no: 'CLR-2026-001',
      })
    ).toBe(true);
    expect(
      isClearanceWithdrawalTx({
        transaction_type: 'deposit',
        description: 'Kliring',
      })
    ).toBe(false);
    expect(
      isClearanceWithdrawalTx({
        transaction_type: 'withdrawal',
        description: 'Pencairan Massal Simpanan Lebaran',
      })
    ).toBe(false);

    expect(
      isClearanceLoanRepayment({ payment_method: 'POTONG_SIMPANAN_KLIRING', notes: '' })
    ).toBe(true);
    expect(
      isClearanceLoanRepayment({
        payment_method: 'Transfer Bank',
        notes: 'Pelunasan otomatis melalui kliring anggota keluar (net settlement)',
      })
    ).toBe(true);
    expect(
      isClearanceLoanRepayment({ payment_method: 'Potong Gaji', notes: 'Angsuran bulan ke-3' })
    ).toBe(false);
  });

  it('formats surplus and deficit clearance cash_flow descriptions consistently', () => {
    expect(
      formatMemberClearanceCashFlowDescription({
        memberNrp: '(lama 1) 00010062',
        memberName: 'MOCH. ALIF NURSYARIFUDDIN',
        totalSavings: 10460000,
        totalDebtOffset: 0,
        netSettlement: 10460000,
      })
    ).toBe(
      'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000'
    );

    expect(
      formatMemberClearanceCashFlowDescription({
        memberNrp: '88010001',
        memberName: 'Budi Santoso',
        totalSavings: 5000000,
        totalDebtOffset: 12000000,
        netSettlement: -7000000,
      })
    ).toBe(
      'Kliring Pengunduran Diri — 88010001 - Budi Santoso | Hak Simpanan: Rp 5.000.000, Potong Utang: Rp 12.000.000, Kekurangan Disetor Anggota: Rp 7.000.000'
    );

    expect(
      formatMemberClearanceCashFlowDescription({
        memberNrp: '',
        memberName: 'Siti Aminah',
        totalSavings: 100000,
        totalDebtOffset: 50000,
        netSettlement: 50000,
      })
    ).toBe(
      'Kliring Pengunduran Diri — Siti Aminah | Hak Simpanan: Rp 100.000, Potong Utang: Rp 50.000, Kas Dibayarkan: Rp 50.000'
    );
  });

  it('extracts NRP from clearance descriptions while ignoring currency amounts after pipe', () => {
    expect(
      extractNrpFromClearanceDescription(
        'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000'
      )
    ).toBe('00010062');
    expect(
      extractNrpFromClearanceDescription(
        'Kliring Pengunduran Diri — (lama 1) 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000'
      )
    ).toBe('00010062');
    expect(
      extractNrpFromClearanceDescription('Kliring manual NRP 88010099 atas nama Budi')
    ).toBe('88010099');
    expect(
      extractNrpFromClearanceDescription('Kliring Pengunduran Diri — 001 - Siti')
    ).toBe('001');
    expect(
      extractNrpFromClearanceDescription(
        'Kliring Pengunduran Diri — Anggota | Hak Simpanan: Rp 10.460.000'
      )
    ).toBeNull();
    expect(extractNrpFromClearanceDescription('-')).toBeNull();
    expect(extractNrpFromClearanceDescription(null)).toBeNull();
  });

  it('matches member NRP strictly with boundary checking and strips (lama X) prefix', () => {
    const desc =
      'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000';
    expect(descriptionContainsClearanceMemberNrp(desc, '(lama 1) 00010062')).toBe(true);
    expect(descriptionContainsClearanceMemberNrp(desc, '00010062')).toBe(true);

    // Must not false-match partial substring prefixes
    expect(
      descriptionContainsClearanceMemberNrp(
        'Kliring Pengunduran Diri — 001002 - Anggota Lain | Hak Simpanan: Rp 500.000',
        '001'
      )
    ).toBe(false);
    expect(
      descriptionContainsClearanceMemberNrp(
        'Kliring Pengunduran Diri — 001 - Anggota Tiga Digit | Hak Simpanan: Rp 500.000',
        '001'
      )
    ).toBe(true);
  });

  it('partitions and deduplicates KLIRING_ANGGOTA_KELUAR rows keeping CF-13BA88C2 over CF-2A2CEE11 regardless of order', () => {
    const rowKeep = {
      id: '13ba88c2-1111-4000-8000-000000000001',
      category: 'KLIRING_ANGGOTA_KELUAR',
      reference_id: 'mem-alif',
      description:
        'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
      created_at: '2026-11-19T14:20:00.000Z',
    };
    const rowDupSameRefReversedOrder = {
      id: '2a2cee11-1111-4000-8000-000000000002',
      category: 'KLIRING_ANGGOTA_KELUAR',
      reference_id: 'mem-alif',
      description:
        'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
      created_at: '2026-11-19T14:20:00.000Z',
    };
    const rowDupNullRefSameNrp = {
      id: '2a2cee11-9999-4000-8000-000000000003',
      category: 'kliring_anggota_keluar',
      reference_id: null,
      description:
        'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000',
      created_at: '2026-11-19T14:25:00.000Z',
    };
    const rowOtherMember = {
      id: '33333333-1111-4000-8000-000000000004',
      category: 'KLIRING_ANGGOTA_KELUAR',
      reference_id: 'mem-budi',
      description:
        'Kliring Pengunduran Diri — 88010099 - Budi Santoso | Hak Simpanan: Rp 2.000.000',
      created_at: '2026-11-19T15:00:00.000Z',
    };
    const nonClearanceRow = {
      id: 'aaaaaaaa-0000-4000-8000-000000000000',
      category: 'penjualan_tunai',
      reference_id: 'mem-alif',
      description: 'Penjualan Tunai POS',
      created_at: '2026-11-19T10:00:00.000Z',
    };

    const rows = [
      nonClearanceRow,
      rowDupSameRefReversedOrder,
      rowDupNullRefSameNrp,
      rowKeep,
      rowOtherMember,
    ];

    const { kept, duplicates } = partitionDuplicateClearanceRows(rows);
    expect(kept.map((r) => r.id)).toEqual([rowKeep.id, rowOtherMember.id]);
    expect(duplicates.map((r) => r.id)).toEqual([
      rowDupSameRefReversedOrder.id,
      rowDupNullRefSameNrp.id,
    ]);

    const deduped = deduplicateClearanceRowsInMemory(rows);
    expect(deduped.map((r) => r.id)).toEqual([
      nonClearanceRow.id,
      rowKeep.id,
      rowOtherMember.id,
    ]);
  });
});
