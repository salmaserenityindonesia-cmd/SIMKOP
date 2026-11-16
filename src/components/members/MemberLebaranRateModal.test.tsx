import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import MemberLebaranRateModal, {
  computeNextCycleStartPeriod,
  getIndonesianMonthLabel,
} from './MemberLebaranRateModal';
import MemberMigrationDetailModal from './MemberMigrationDetailModal';
import SavingsLedgerMatrixModal from '../compliance/SavingsLedgerMatrixModal';
import { MemberLebaranRate, SavingsRateTier } from '../../services/savingsRateService';
import { Anggota } from '../../services/koperasiService';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }),
    },
  },
}));

describe('MemberLebaranRateModal & UI Integration', () => {
  const sampleMember: Anggota = {
    id: 'mem-agus',
    nrp: '95168420',
    nama: 'Agus Susanto',
    pangkat: 'Bripka',
    status: 'aktif',
    membership_status: 'ACTIVE',
    created_at: '2024-01-01T00:00:00.000Z',
  };

  describe('computeNextCycleStartPeriod', () => {
    it('adds 1 month to the last completed Lebaran cut-off date', () => {
      expect(computeNextCycleStartPeriod('2026-03-20')).toEqual({
        year: 2026,
        month: 4,
        defaultLabel: 'Awal Siklus Lebaran 2026',
      });
    });

    it('rolls over December cut-off to January of next year', () => {
      expect(computeNextCycleStartPeriod('2025-12-15')).toEqual({
        year: 2026,
        month: 1,
        defaultLabel: 'Awal Siklus Lebaran 2026',
      });
    });

    it('falls back to fallbackDate when no completed cycle exists', () => {
      expect(computeNextCycleStartPeriod(null, new Date(2026, 10, 16))).toEqual({
        year: 2026,
        month: 11,
        defaultLabel: 'Awal Siklus Lebaran 2026',
      });
    });

    it('formats Indonesian month names accurately', () => {
      expect(getIndonesianMonthLabel(4)).toBe('April');
      expect(getIndonesianMonthLabel(11)).toBe('November');
    });
  });

  describe('MemberLebaranRateModal Rendering', () => {
    it('renders nothing when closed or member is null', () => {
      expect(
        renderToStaticMarkup(
          <MemberLebaranRateModal isOpen={false} onClose={vi.fn()} member={sampleMember} />
        )
      ).toBe('');
      expect(
        renderToStaticMarkup(
          <MemberLebaranRateModal isOpen={true} onClose={vi.fn()} member={null} />
        )
      ).toBe('');
    });

    it('renders global fallback badge when member has no personal Lebaran rate', () => {
      const html = renderToStaticMarkup(
        <MemberLebaranRateModal
          isOpen={true}
          onClose={vi.fn()}
          member={sampleMember}
          initialPersonalRates={[]}
          initialGlobalRate={200000}
          initialEffectiveYear={2026}
          initialEffectiveMonth={4}
        />
      );

      expect(html).toContain('Pengaturan Simpanan Lebaran Pribadi');
      expect(html).toContain('Agus Susanto');
      expect(html).toContain('95168420');
      expect(html).toContain('Mengikuti Tarif Global Pengaturan');
      expect(html).toContain('200.000');
      expect(html).toContain('Simpan Ketentuan Lebaran');
    });

    it('renders personal rate badge and history table when member has active personal rate', () => {
      const personalRates: MemberLebaranRate[] = [
        {
          id: 'mlr-1',
          member_id: 'mem-agus',
          effective_year: 2026,
          effective_month: 4,
          monthly_rate: 400000,
          cycle_label: 'Awal Siklus Lebaran 2026',
          notes: 'Rencana mudik',
        },
      ];

      const html = renderToStaticMarkup(
        <MemberLebaranRateModal
          isOpen={true}
          onClose={vi.fn()}
          member={sampleMember}
          initialPersonalRates={personalRates}
          initialGlobalRate={200000}
          initialEffectiveYear={2026}
          initialEffectiveMonth={4}
        />
      );

      expect(html).toContain('Ketentuan Pribadi Anggota (Berlaku sejak April 2026)');
      expect(html).toContain('400.000');
      expect(html).toContain('Awal Siklus Lebaran 2026');
      expect(html).toContain('Rencana mudik');
      expect(html).toContain('Aktif');
    });
  });

  describe('Entry Points in MemberMigrationDetailModal & SavingsLedgerMatrixModal', () => {
    it('renders "Atur Besaran Simpanan Lebaran Pribadi" button in MemberMigrationDetailModal', () => {
      const html = renderToStaticMarkup(
        <MemberMigrationDetailModal
          isOpen={true}
          onClose={vi.fn()}
          member={sampleMember}
        />
      );
      expect(html).toContain('Atur Besaran Simpanan Lebaran Pribadi');
    });

    it('renders personal Lebaran tariff badge and "Ubah Tarif Lebaran Pribadi" button on LEBARAN tab of SavingsLedgerMatrixModal', () => {
      const globalTiers: SavingsRateTier[] = [
        {
          id: 't-leb',
          deposit_type_code: 'LEBARAN',
          start_year: 2025,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 200000,
        },
      ];
      const personalRates: MemberLebaranRate[] = [
        {
          id: 'mlr-agus',
          member_id: 'mem-agus',
          effective_year: 2026,
          effective_month: 4,
          monthly_rate: 400000,
        },
      ];

      const html = renderToStaticMarkup(
        <SavingsLedgerMatrixModal
          memberId="mem-agus"
          memberNrp="95168420"
          memberName="Agus Susanto"
          onClose={vi.fn()}
          initialActiveTab="LEBARAN"
          initialLoading={false}
          initialRateTiers={globalTiers}
          initialMemberLebaranRates={personalRates}
        />
      );

      expect(html).toContain('Ubah Tarif Lebaran Pribadi');
      expect(html).toContain('Ketentuan Pribadi Anggota (Berlaku sejak April 2026)');
      expect(html).toContain('400.000');
    });
  });
});
