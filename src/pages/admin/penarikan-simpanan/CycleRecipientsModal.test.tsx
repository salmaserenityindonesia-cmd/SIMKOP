import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import CycleRecipientsModal from './CycleRecipientsModal';
import { LebaranDisbursementCycle } from '../../../services/bulkWithdrawalService';

// Mock Supabase
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    }))
  }
}));

describe('CycleRecipientsModal Component', () => {
  const mockCycle: LebaranDisbursementCycle = {
    id: 'cycle-123',
    cycle_name: 'Pencairan Lebaran 1445 H',
    disbursement_date: '2024-04-10',
    cut_off_date: '2024-04-10',
    total_members: 15,
    total_amount: 15000000,
    status: 'COMPLETED',
    source_type: 'HISTORICAL_INPUT',
    created_at: '2024-04-10T00:00:00Z',
    updated_at: '2024-04-10T00:00:00Z'
  };

  it('renders modal with cycle details and export buttons when open', () => {
    const html = renderToStaticMarkup(
      <CycleRecipientsModal
        isOpen={true}
        onClose={vi.fn()}
        cycle={mockCycle}
      />
    );

    expect(html).toContain('Daftar Penerima Pencairan Simpanan Lebaran');
    expect(html).toContain('Pencairan Lebaran 1445 H');
    expect(html).toContain('Total Penerima:');
    expect(html).toContain('Total Dana:');
    expect(html).toContain('Ekspor CSV');
    expect(html).toContain('Cari NRP, Nama, atau Rekening...');
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <CycleRecipientsModal
        isOpen={false}
        onClose={vi.fn()}
        cycle={mockCycle}
      />
    );

    expect(html).toBe('');
  });
});

