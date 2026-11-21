import { describe, it, expect } from 'vitest';
import {
  buildMemberDepositTypeSummary,
  formatMemberDepositCashFlowDescription,
  hasMemberDepositTypeComponents,
  injectDepositTypesIntoMemberDepositDescription,
  normalizeDepositTypeShortName,
  parseMemberDepositDescriptionComponents,
} from './depositCashFlowFormat';

describe('depositCashFlowFormat — Member Deposit Components Helpers', () => {
  it('normalizes canonical and custom deposit type names into concise labels', () => {
    expect(normalizeDepositTypeShortName('POKOK', 'Simpanan Pokok')).toBe('Pokok');
    expect(normalizeDepositTypeShortName('SP', null)).toBe('Pokok');
    expect(normalizeDepositTypeShortName('WAJIB', 'Simpanan Wajib')).toBe('Wajib');
    expect(normalizeDepositTypeShortName('SW', null)).toBe('Wajib');
    expect(normalizeDepositTypeShortName('BELANJA', 'Simpanan Belanja')).toBe('Belanja');
    expect(normalizeDepositTypeShortName('SB', null)).toBe('Belanja');
    expect(normalizeDepositTypeShortName('LEBARAN', 'Simpanan Lebaran')).toBe('Lebaran');
    expect(normalizeDepositTypeShortName('SHR', 'Simpanan Hari Raya')).toBe('Lebaran');
    expect(normalizeDepositTypeShortName('PINJAMAN', 'Angsuran Pinjaman Reguler')).toBe(
      'Angsuran Pinjaman'
    );
    expect(normalizeDepositTypeShortName('SUKARELA', 'Simpanan Sukarela (Nov 2026)')).toBe(
      'Sukarela'
    );
    expect(normalizeDepositTypeShortName('', null)).toBeNull();
    expect(normalizeDepositTypeShortName('-', '-')).toBeNull();
  });

  it('builds deduplicated and canonically ordered type summary across savings & loans', () => {
    const outOfOrder = buildMemberDepositTypeSummary([
      { code: 'LEBARAN', name: 'Simpanan Lebaran' },
      { code: 'WAJIB', name: 'Simpanan Wajib' },
      { code: 'BELANJA', name: 'Simpanan Belanja' },
      { code: 'WAJIB', name: 'Simpanan Wajib' },
      { code: 'POKOK', name: 'Simpanan Pokok' },
    ]);
    expect(outOfOrder).toBe('Pokok, Wajib, Belanja, Lebaran');

    const withLoanAndCustom = buildMemberDepositTypeSummary([
      { code: 'PINJAMAN', name: 'Angsuran Pinjaman', category: 'loan' },
      { code: 'KHUSUS', name: 'Simpanan Khusus' },
      { code: 'LEBARAN', name: 'Simpanan Lebaran' },
      { code: 'BELANJA', name: 'Simpanan Belanja' },
      { code: 'WAJIB', name: 'Simpanan Wajib' },
    ]);
    expect(withLoanAndCustom).toBe('Wajib, Belanja, Lebaran, Khusus, Angsuran Pinjaman');
  });

  it('formats SETORAN_ANGGOTA description with and without deposit type components', () => {
    expect(
      formatMemberDepositCashFlowDescription({
        typeSummary: 'Wajib, Belanja, Lebaran',
        memberName: 'ZUH RISSA NUR',
        memberNrp: '00060124',
        paymentMethodLabel: 'Tunai',
        receiptNo: 'KW-SETOR-20261121-1837',
      })
    ).toBe(
      'Setoran Anggota (Wajib, Belanja, Lebaran) — ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]'
    );

    expect(
      formatMemberDepositCashFlowDescription({
        typeSummary: '',
        memberName: 'ZUH RISSA NUR',
        memberNrp: '00060124',
        paymentMethodLabel: 'Tunai',
        receiptNo: 'KW-SETOR-20261121-1837',
      })
    ).toBe(
      'Setoran Anggota ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]'
    );
  });

  it('detects and idempotently injects deposit type components into legacy/blank descriptions', () => {
    const legacy =
      'Setoran Anggota ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]';
    const expected =
      'Setoran Anggota (Wajib, Belanja, Lebaran) — ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]';

    expect(hasMemberDepositTypeComponents(legacy)).toBe(false);
    expect(hasMemberDepositTypeComponents(expected)).toBe(true);

    const injected = injectDepositTypesIntoMemberDepositDescription(
      legacy,
      'Wajib, Belanja, Lebaran'
    );
    expect(injected).toBe(expected);

    // Idempotent when already enriched
    expect(
      injectDepositTypesIntoMemberDepositDescription(injected, 'Pokok, Wajib')
    ).toBe(expected);

    // Blank / dash fallback reconstruction
    expect(
      injectDepositTypesIntoMemberDepositDescription('-', 'Wajib', {
        memberName: 'BAGUS BUDI PRASETYO',
        memberNrp: '00050543',
        paymentMethodLabel: 'Transfer Bank',
        receiptNo: 'KW-SETOR-20261120-3663',
      })
    ).toBe(
      'Setoran Anggota (Wajib) — BAGUS BUDI PRASETYO (00050543) - Transfer Bank [KW-SETOR-20261120-3663]'
    );
  });

  it('parses deposit type component badges only from enriched SETORAN_ANGGOTA descriptions', () => {
    expect(
      parseMemberDepositDescriptionComponents(
        'Setoran Anggota (Wajib, Belanja, Lebaran) — ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]'
      )
    ).toEqual(['Wajib', 'Belanja', 'Lebaran']);

    expect(
      parseMemberDepositDescriptionComponents(
        'Setoran Anggota ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]'
      )
    ).toEqual([]);

    expect(
      parseMemberDepositDescriptionComponents(
        'Setoran Simpanan Wajib [Mar 2026] — 00060019 - DONNY ILHAM PAMBUDI'
      )
    ).toEqual([]);
  });
});
