import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import MemberMigrationDetailModal, { extractMigrationDeposits } from './MemberMigrationDetailModal';
import { Anggota } from '../../services/koperasiService';

describe('MemberMigrationDetailModal - Snapshot Data Migrasi Awal Anggota', () => {
  const dummyMember: Anggota = {
    id: 'member-123',
    nrp: '78010234',
    nama: 'Bripka Joko Susilo',
    pangkat: 'Bripka',
    bank_account_number: '9876543210',
    membership_status: 'ACTIVE',
    status: 'aktif',
    created_at: '2023-01-15T00:00:00.000Z'
  };

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={false}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );
    expect(html).toBe('');
  });

  it('renders nothing when member is null', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={null}
      />
    );
    expect(html).toBe('');
  });

  it('renders header with NRP, nama, and 14-kolom badge when open', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Rincian Data Migrasi Awal Anggota');
    expect(html).toContain('14 Kolom Snapshot');
    expect(html).toContain('78010234');
    expect(html).toContain('Bripka Joko Susilo');
  });

  it('renders Card 1 with member profile and employment details', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Card 1: Profil &amp; Kepegawaian');
    expect(html).toContain('78010234');
    expect(html).toContain('Bripka Joko Susilo');
    expect(html).toContain('Bripka');
    expect(html).toContain('9876543210');
    expect(html).toContain('ACTIVE');
  });

  it('renders Card 2 with initial migration deposits and total', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Card 2: Simpanan Awal Migrasi');
    expect(html).toContain('Simpanan Pokok');
    expect(html).toContain('Simpanan Wajib (Utuh)');
    expect(html).toContain('Simpanan Belanja');
    expect(html).toContain('Simpanan Lebaran');
    expect(html).toContain('Total Akumulasi Simpanan Awal');
  });

  it('renders Card 3 with neutral badge when member has no loan', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Card 3: Pinjaman Bawaan Migrasi');
    expect(html).toContain('Tidak Memiliki Pinjaman Bawaan Migrasi');
  });

  it('renders footer with historical snapshot explanation and close button', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Data ini merupakan catatan historis snapshot migrasi anggota (14 Kolom Template)');
    expect(html).toContain('Tutup');
  });
});

describe('extractMigrationDeposits - Overwritten Single Migration Balances Calculation', () => {
  it('extracts clean single migration deposits and calculates total (Joko Ramadhan clean case)', () => {
    const mockDeposits = [
      {
        deposit_types: { name: 'Simpanan Pokok', code: 'SP' },
        deposit_transactions: [
          {
            id: 'tx-1',
            amount: 10000,
            description: 'Saldo Awal Migrasi Sistem',
            created_at: '2023-01-01T00:00:00.000Z'
          }
        ]
      },
      {
        deposit_types: { name: 'Simpanan Wajib', code: 'SW' },
        deposit_transactions: [
          {
            id: 'tx-2',
            amount: 2000000,
            description: 'Migrasi Saldo Awal (As-Is)',
            created_at: '2023-01-01T00:00:00.000Z'
          }
        ]
      },
      {
        deposit_types: { name: 'Simpanan Belanja', code: 'SB' },
        deposit_transactions: [
          {
            id: 'tx-3',
            amount: 500000,
            description: 'Saldo Awal Migrasi Sistem',
            created_at: '2023-01-01T00:00:00.000Z'
          }
        ]
      },
      {
        deposit_types: { name: 'Simpanan Lebaran', code: 'SL' },
        deposit_transactions: [
          {
            id: 'tx-4',
            amount: 300000,
            description: 'Saldo Awal Migrasi Sistem',
            created_at: '2023-01-01T00:00:00.000Z'
          }
        ]
      }
    ];

    const result = extractMigrationDeposits(mockDeposits);
    expect(result.pokok).toBe(10000);
    expect(result.wajib).toBe(2000000);
    expect(result.belanja).toBe(500000);
    expect(result.lebaran).toBe(300000);
    expect(result.total).toBe(2810000);
  });

  it('prioritizes latest migration transaction over accumulated 12 historical records (Joko Ramadhan multi-import test case)', () => {
    // 12 historical transactions of Rp 10.000 from old repeated imports
    const historicalTxs = Array.from({ length: 12 }, (_, i) => ({
      id: `tx-old-${i + 1}`,
      amount: 10000,
      description: 'One-Time Principal Deposit Migration',
      created_at: `2023-0${(i % 9) + 1}-01T00:00:00.000Z`
    }));

    // Add latest migration transaction with updated timestamp
    historicalTxs.push({
      id: 'tx-latest',
      amount: 10000,
      description: 'Saldo Awal Migrasi Sistem',
      created_at: '2023-12-01T00:00:00.000Z'
    });

    const mockDeposits = [
      {
        deposit_types: { name: 'Simpanan Pokok', code: 'SP' },
        deposit_transactions: historicalTxs
      },
      {
        deposit_types: { name: 'Simpanan Wajib', code: 'SW' },
        deposit_transactions: [
          {
            id: 'sw-1',
            amount: 2000000,
            description: 'Migrasi Saldo Awal (As-Is)',
            created_at: '2023-12-01T00:00:00.000Z'
          }
        ]
      },
      {
        deposit_types: { name: 'Simpanan Belanja', code: 'SB' },
        deposit_transactions: [
          {
            id: 'sb-1',
            amount: 500000,
            description: 'Saldo Awal Migrasi Sistem',
            created_at: '2023-12-01T00:00:00.000Z'
          }
        ]
      },
      {
        deposit_types: { name: 'Simpanan Lebaran', code: 'SL' },
        deposit_transactions: [
          {
            id: 'sl-1',
            amount: 300000,
            description: 'Saldo Awal Migrasi Sistem',
            created_at: '2023-12-01T00:00:00.000Z'
          }
        ]
      }
    ];

    const result = extractMigrationDeposits(mockDeposits);
    // Simpanan Pokok must be strictly Rp 10.000, NOT Rp 130.000 or accumulated Rp 120.000!
    expect(result.pokok).toBe(10000);
    expect(result.wajib).toBe(2000000);
    expect(result.belanja).toBe(500000);
    expect(result.lebaran).toBe(300000);
    expect(result.total).toBe(2810000);
  });

  it('recognizes various migration description formats (migrasi, migration, saldo awal, historical, one-time)', () => {
    const mockDeposits = [
      {
        deposit_types: { name: 'Simpanan Pokok', code: 'SP' },
        deposit_transactions: [
          { id: '1', amount: 50000, description: 'One-Time Principal Deposit Migration', created_at: '2023-01-01' }
        ]
      },
      {
        deposit_types: { name: 'Simpanan Wajib', code: 'SW' },
        deposit_transactions: [
          { id: '2', amount: 150000, description: 'Historical Balance Migration', created_at: '2023-01-01' }
        ]
      },
      {
        deposit_types: { name: 'Simpanan Belanja', code: 'SB' },
        deposit_transactions: [
          { id: '3', amount: 75000, description: 'Saldo Awal Anggota', created_at: '2023-01-01' }
        ]
      },
      {
        deposit_types: { name: 'Simpanan Hari Raya', code: 'SHR' },
        deposit_transactions: [
          { id: '4', amount: 25000, description: 'Migrasi Saldo Awal', created_at: '2023-01-01' }
        ]
      }
    ];

    const result = extractMigrationDeposits(mockDeposits);
    expect(result.pokok).toBe(50000);
    expect(result.wajib).toBe(150000);
    expect(result.belanja).toBe(75000);
    expect(result.lebaran).toBe(25000);
    expect(result.total).toBe(300000);
  });

  it('handles empty deposit transactions gracefully', () => {
    const mockDeposits = [
      {
        deposit_types: { name: 'Simpanan Pokok', code: 'SP' },
        deposit_transactions: []
      }
    ];

    const result = extractMigrationDeposits(mockDeposits);
    expect(result.pokok).toBe(0);
    expect(result.wajib).toBe(0);
    expect(result.belanja).toBe(0);
    expect(result.lebaran).toBe(0);
    expect(result.total).toBe(0);
  });
});

