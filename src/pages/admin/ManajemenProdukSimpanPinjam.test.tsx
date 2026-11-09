import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ManajemenProdukSimpanPinjam from './ManajemenProdukSimpanPinjam';
import { DepositType, LoanType } from '../../services/koperasiService';

// Mock AdminLayout
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock FeedbackContext
vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
}));

describe('ManajemenProdukSimpanPinjam Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders deposit types with effective amount and badge when synced from active tier', () => {
    const mockDepositTypes: DepositType[] = [
      {
        id: 'dep-1',
        code: 'SW',
        name: 'Simpanan Wajib',
        frequency_type: 'monthly',
        default_amount: 50000,
        effective_amount: 210000,
        can_be_withdrawn: false,
        is_active: true,
      },
      {
        id: 'dep-2',
        code: 'SP',
        name: 'Simpanan Pokok',
        frequency_type: 'one_time',
        default_amount: 100000,
        effective_amount: 100000,
        can_be_withdrawn: false,
        is_active: true,
      },
    ];

    const html = renderToStaticMarkup(
      <ManajemenProdukSimpanPinjam
        initialDepositTypes={mockDepositTypes}
        initialLoading={false}
      />
    );

    // SW should display the effective amount (210.000) and the sync badge
    expect(html).toContain('210.000');
    expect(html).toContain('* Sinkron Tarif Bertingkat');

    // SP should display 100.000 without the sync badge because effective matches default
    expect(html).toContain('100.000');
    expect(html).toContain('Simpanan Pokok');
    expect(html).toContain('Simpanan Wajib');
  });

  it('renders standard default_amount when effective_amount is not set', () => {
    const mockDepositTypes: DepositType[] = [
      {
        id: 'dep-3',
        code: 'SS',
        name: 'Simpanan Sukarela',
        frequency_type: 'monthly',
        default_amount: 75000,
        can_be_withdrawn: true,
        is_active: true,
      },
    ];

    const html = renderToStaticMarkup(
      <ManajemenProdukSimpanPinjam
        initialDepositTypes={mockDepositTypes}
        initialLoading={false}
      />
    );

    expect(html).toContain('75.000');
    expect(html).not.toContain('* Sinkron Tarif Bertingkat');
  });

  it('renders Simpanan Pokok with effective amount and badge when rate tier differs from default', () => {
    const mockDepositTypes: DepositType[] = [
      {
        id: 'dep-sp',
        code: 'SP',
        name: 'Simpanan Pokok',
        frequency_type: 'one_time',
        default_amount: 100000,
        effective_amount: 150000,
        can_be_withdrawn: false,
        is_active: true,
      },
    ];

    const html = renderToStaticMarkup(
      <ManajemenProdukSimpanPinjam
        initialDepositTypes={mockDepositTypes}
        initialLoading={false}
      />
    );

    expect(html).toContain('150.000');
    expect(html).toContain('* Sinkron Tarif Bertingkat');
    expect(html).toContain('Simpanan Pokok');
  });
});
