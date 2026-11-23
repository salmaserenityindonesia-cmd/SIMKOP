import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import AuditDataOrphan from './AuditDataOrphan';
import type { OrphanRecordItem } from '../../services/orphanAuditService';

vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
}));

describe('AuditDataOrphan Page', () => {
  it('renders positive empty state when no orphan records are found', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin/audit-orphan']}>
        <AuditDataOrphan initialItems={[]} initialScannedAt="2026-11-23T10:00:00.000Z" />
      </MemoryRouter>
    );

    expect(html).toContain('Verifikasi &amp; Audit Data Orphan');
    expect(html).toContain('Database Bersih &amp; Sinkron');
    expect(html).toContain('Tidak Ditemukan Data Orphan — Seluruh Referensi Database Valid');
    expect(html).toContain('Pindai Ulang Sekarang');
  });

  it('renders CF-AFC2CE88 and CF-9F0EE1EF with cash-in impact summary of Rp 1.300.000', () => {
    const sampleItems: OrphanRecordItem[] = [
      {
        id: 'afc2ce88-1111-4000-8000-000000000001',
        sourceTable: 'cash_flow',
        referenceCode: 'CF-AFC2CE88',
        transactionDate: '2026-11-10T08:00:00.000Z',
        moduleCategory: 'Arus Kas Pinjaman',
        description: 'Angsuran Pinjaman Budi (99999998)',
        amount: 500000,
        direction: 'in',
        missingTarget: 'loans',
        reason: 'Kontrak pinjaman anggota 99999998 sudah dihapus dari tabel loans.',
        rawRecord: { id: 'afc2ce88-1111-4000-8000-000000000001', amount: 500000 },
      },
      {
        id: '9f0ee1ef-2222-4000-8000-000000000002',
        sourceTable: 'cash_flow',
        referenceCode: 'CF-9F0EE1EF',
        transactionDate: '2026-11-11T09:00:00.000Z',
        moduleCategory: 'Arus Kas Pinjaman',
        description: 'Angsuran Pinjaman Andi (99999999)',
        amount: 800000,
        direction: 'in',
        missingTarget: 'loans',
        reason: 'Kontrak pinjaman anggota 99999999 sudah dihapus dari tabel loans.',
        rawRecord: { id: '9f0ee1ef-2222-4000-8000-000000000002', amount: 800000 },
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin/audit-orphan']}>
        <AuditDataOrphan
          initialItems={sampleItems}
          initialScannedAt="2026-11-23T10:00:00.000Z"
        />
      </MemoryRouter>
    );

    expect(html).toContain('Perlu Perhatian Admin');
    expect(html).toContain('CF-AFC2CE88');
    expect(html).toContain('CF-9F0EE1EF');
    expect(html).toContain('Rp');
    expect(html).toContain('1.300.000');
    expect(html).toContain('Hapus Terpilih (0)');
    expect(html).toContain('Kontrak pinjaman anggota 99999998 sudah dihapus dari tabel loans.');
    expect(html).toContain('Detail');
    expect(html).toContain('Hapus');
  });

  it('calculates Dampak Kas Masuk/Keluar strictly from cash_flow records and ignores loan_schedules amounts', () => {
    const mixedItems: OrphanRecordItem[] = [
      {
        id: 'sch-orphan-1',
        sourceTable: 'loan_schedules',
        referenceCode: 'SCH-11111111',
        transactionDate: '2026-11-05T00:00:00.000Z',
        moduleCategory: 'Jadwal Angsuran',
        description: 'Jadwal angsuran non-kas',
        amount: 50000000,
        direction: 'in',
        missingTarget: 'loans',
        reason: 'loan_id hilang',
        rawRecord: { id: 'sch-orphan-1' },
      },
      {
        id: 'cf-in-1',
        sourceTable: 'cash_flow',
        referenceCode: 'CF-22222222',
        transactionDate: '2026-11-10T08:00:00.000Z',
        moduleCategory: 'Arus Kas Pinjaman',
        description: 'Kas masuk orphan',
        amount: 350000,
        direction: 'in',
        missingTarget: 'loans',
        reason: 'Induk pinjaman hilang',
        rawRecord: { id: 'cf-in-1' },
      },
      {
        id: 'cf-out-1',
        sourceTable: 'cash_flow',
        referenceCode: 'CF-33333333',
        transactionDate: '2026-11-11T08:00:00.000Z',
        moduleCategory: 'Arus Kas Simpanan',
        description: 'Kas keluar orphan',
        amount: 125000,
        direction: 'out',
        missingTarget: 'deposit_transactions',
        reason: 'Transaksi simpanan hilang',
        rawRecord: { id: 'cf-out-1' },
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin/audit-orphan']}>
        <AuditDataOrphan
          initialItems={mixedItems}
          initialScannedAt="2026-11-23T10:00:00.000Z"
        />
      </MemoryRouter>
    );

    expect(html).toContain('350.000');
    expect(html).toContain('125.000');
    expect(html).not.toContain('50.350.000');
  });
});
