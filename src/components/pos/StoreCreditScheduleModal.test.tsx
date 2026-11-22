import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StoreCreditScheduleModal from './StoreCreditScheduleModal';
import { StoreCreditPlanWithSchedules, payStoreCreditSchedule } from '../../services/storeCreditLedgerService';

// Mock feedback context
vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    showAlert: vi.fn(),
  }),
}));

// Mock storeCreditLedgerService
vi.mock('../../services/storeCreditLedgerService', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    payStoreCreditSchedule: vi.fn().mockResolvedValue({ success: true, scheduleId: 'sched-2' }),
  };
});

describe('StoreCreditScheduleModal Component', () => {
  const mockPlan: StoreCreditPlanWithSchedules = {
    id: 'plan-123',
    member_id: 'mem-99',
    latest_sale_id: 'sale-001',
    previous_unpaid_balance: 500000,
    new_credit_amount: 250000,
    total_consolidated_debt: 750000,
    tenor_months: 3,
    monthly_installment: 250000,
    status: 'active',
    created_at: '2026-11-16T10:00:00Z',
    updated_at: '2026-11-16T10:00:00Z',
    anggota: {
      id: 'mem-99',
      nama: 'Serma Agus Supriyadi',
      nrp: '98765432',
      tanggal_lahir: '1984-04-12'
    },
    schedules: [
      {
        id: 'sched-1',
        plan_id: 'plan-123',
        member_id: 'mem-99',
        period_number: 1,
        due_year: 2026,
        due_month: 12,
        due_date: '2026-12-01',
        target_amount: 250000,
        paid_amount: 250000,
        status: 'paid',
        paid_at: '2026-11-20T10:00:00Z',
        created_at: '2026-11-16T10:00:00Z'
      },
      {
        id: 'sched-2',
        plan_id: 'plan-123',
        member_id: 'mem-99',
        period_number: 2,
        due_year: 2027,
        due_month: 1,
        due_date: '2027-01-01',
        target_amount: 250000,
        paid_amount: 100000,
        status: 'partial',
        created_at: '2026-11-16T10:00:00Z'
      },
      {
        id: 'sched-3',
        plan_id: 'plan-123',
        member_id: 'mem-99',
        period_number: 3,
        due_year: 2027,
        due_month: 2,
        due_date: '2027-02-01',
        target_amount: 250000,
        paid_amount: 0,
        status: 'unpaid',
        created_at: '2026-11-16T10:00:00Z'
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render markup when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <StoreCreditScheduleModal
        isOpen={false}
        plan={mockPlan}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );
    expect(html).toBe('');
  });

  it('does not render markup when plan is null', () => {
    const html = renderToStaticMarkup(
      <StoreCreditScheduleModal
        isOpen={true}
        plan={null}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );
    expect(html).toBe('');
  });

  it('renders modal header, member identity, and consolidated loan breakdown', () => {
    const html = renderToStaticMarkup(
      <StoreCreditScheduleModal
        isOpen={true}
        plan={mockPlan}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    expect(html).toContain('Buku Bantu Angsuran Bon Toko');
    expect(html).toContain('Serma Agus Supriyadi');
    expect(html).toContain('98765432');
    expect(html).toContain('12/04/1984');

    // Akumulasi Konsolidasi
    expect(html).toContain('Sisa Bon Lama:');
    expect(html).toContain('Nota Baru:');
    expect(html).toContain('Total Konsolidasi:');
    expect(html).toContain('Tenor Aktif');
    expect(html).toContain('3 Bulan');
    expect(html).toContain('Angsuran Potong Gaji / Bulan');
  });

  it('renders payment method options, receipt input, and schedule table rows', () => {
    const html = renderToStaticMarkup(
      <StoreCreditScheduleModal
        isOpen={true}
        plan={mockPlan}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    // Metode Bayar
    expect(html).toContain('Potong Gaji');
    expect(html).toContain('Tunai');
    expect(html).toContain('Transfer');
    expect(html).toContain('No. Bukti / Kwitansi');

    // Grid Jadwal Angsuran
    expect(html).toContain('Periode Ke-1');
    expect(html).toContain('Periode Ke-2');
    expect(html).toContain('Periode Ke-3');

    // Status Badges
    expect(html).toContain('LUNAS');
    expect(html).toContain('SEBAGIAN');
    expect(html).toContain('BELUM BAYAR');

    // Tombol penagihan harus tampil untuk baris belum lunas & tombol Lunasi Semua Sisa Periode
    expect(html).toContain('Tagih / Lunasi Angsuran');
    expect(html).toContain('Lunasi Semua Sisa Periode (2)');
  });

  it('renders high-contrast dark theme across table header, rows, badges, and inputs', () => {
    const html = renderToStaticMarkup(
      <StoreCreditScheduleModal
        isOpen={true}
        plan={mockPlan}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    expect(html).toContain('bg-slate-900');
    expect(html).toContain('bg-slate-800/95');
    expect(html).toContain('bg-rose-950/90');
    expect(html).toContain('bg-amber-950/90');
    expect(html).toContain('bg-emerald-950/90');
    expect(html).not.toMatch(/\bbg-white(?!\/)/);
    expect(html).not.toContain('bg-slate-50');
    expect(html).not.toContain('bg-gray-50');
    expect(html).not.toContain('bg-gray-100');
    expect(html).not.toContain('bg-gray-750');
    expect(html).not.toContain('odd:bg-white');
  });

  it('ensures complete isolation from loan-matrix and loans table', () => {
    const html = renderToStaticMarkup(
      <StoreCreditScheduleModal
        isOpen={true}
        plan={mockPlan}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    // Ketiadaan markup / referensi ke loan-matrix
    expect(html).not.toContain('loan-matrix');
    expect(html).not.toContain('/admin/loan-matrix');
    expect(html).not.toContain('Matriks Pinjaman');
    expect(html).toContain('Buku Besar Bon Toko');
  });
});
