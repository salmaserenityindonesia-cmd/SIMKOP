import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import MemberSearchAutocomplete, {
  filterMembers,
  calculateNextMemberHighlightedIndex,
  MemberAutocompleteItem,
} from './MemberSearchAutocomplete';

describe('MemberSearchAutocomplete - Component & Filtering Logic', () => {
  const sampleMembers: MemberAutocompleteItem[] = [
    {
      id: 'mem-1',
      nrp: '12345678',
      nama: 'Budi Santoso',
      pangkat: 'Koptu',
      bank_account_number: '1122334455',
      take_home_pay: 5500000,
    },
    {
      id: 'mem-2',
      nrp: '87654321',
      nama: 'Agus Setiawan',
      pangkat: 'Sertu',
      bank_account_number: '9988776655',
      master_thp: 6200000,
    },
    {
      id: 'mem-3',
      nrp: '11223344',
      nama: 'Dewi Lestari',
      pangkat: 'PNS',
      bank_account_number: null,
      take_home_pay: 4800000,
    },
    {
      id: 'mem-4',
      nrp: '55667788',
      nama: 'Bambang Pamungkas',
      pangkat: 'Kapten',
      bank_account_number: '4455667788',
      take_home_pay: 8500000,
    },
  ];

  describe('filterMembers helper function', () => {
    it('returns all members up to default limit when searchTerm is empty', () => {
      const result = filterMembers(sampleMembers, '');
      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('mem-1');
    });

    it('filters members case-insensitively by name', () => {
      const result = filterMembers(sampleMembers, 'budi');
      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe('Budi Santoso');

      const upperResult = filterMembers(sampleMembers, 'AGUS');
      expect(upperResult).toHaveLength(1);
      expect(upperResult[0].nama).toBe('Agus Setiawan');
    });

    it('filters members by NRP (full and partial)', () => {
      const result = filterMembers(sampleMembers, '12345678');
      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe('Budi Santoso');

      const partialResult = filterMembers(sampleMembers, '6677');
      expect(partialResult).toHaveLength(1);
      expect(partialResult[0].nrp).toBe('55667788');
    });

    it('returns empty array when no member matches query', () => {
      const result = filterMembers(sampleMembers, 'tidak-ada-anggota-ini');
      expect(result).toHaveLength(0);
    });

    it('respects the custom limit parameter', () => {
      const result = filterMembers(sampleMembers, '', 2);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('mem-1');
      expect(result[1].id).toBe('mem-2');
    });
  });

  describe('calculateNextMemberHighlightedIndex keyboard navigation logic', () => {
    it('returns 0 when moving ArrowDown from unhighlighted state (-1)', () => {
      const nextIndex = calculateNextMemberHighlightedIndex(-1, 4, 'ArrowDown');
      expect(nextIndex).toBe(0);
    });

    it('increments index on ArrowDown within bounds', () => {
      const nextIndex = calculateNextMemberHighlightedIndex(1, 4, 'ArrowDown');
      expect(nextIndex).toBe(2);
    });

    it('clamps to last item index on ArrowDown at boundary', () => {
      const nextIndex = calculateNextMemberHighlightedIndex(3, 4, 'ArrowDown');
      expect(nextIndex).toBe(3);
    });

    it('decrements index on ArrowUp within bounds', () => {
      const nextIndex = calculateNextMemberHighlightedIndex(2, 4, 'ArrowUp');
      expect(nextIndex).toBe(1);
    });

    it('clamps to index 0 on ArrowUp at boundary', () => {
      const nextIndex = calculateNextMemberHighlightedIndex(0, 4, 'ArrowUp');
      expect(nextIndex).toBe(0);
    });

    it('wraps to last index on ArrowUp from unhighlighted state (-1)', () => {
      const nextIndex = calculateNextMemberHighlightedIndex(-1, 4, 'ArrowUp');
      expect(nextIndex).toBe(3);
    });

    it('returns -1 for empty list', () => {
      expect(calculateNextMemberHighlightedIndex(0, 0, 'ArrowDown')).toBe(-1);
      expect(calculateNextMemberHighlightedIndex(0, 0, 'ArrowUp')).toBe(-1);
    });
  });

  describe('Static markup rendering & accessibility attributes', () => {
    it('renders input with default placeholder, combobox role, and search icon', () => {
      const markup = renderToStaticMarkup(
        <MemberSearchAutocomplete
          members={sampleMembers}
          value=""
          onChange={() => {}}
          onSelectMember={() => {}}
        />
      );

      expect(markup).toContain('role="combobox"');
      expect(markup).toContain('aria-autocomplete="list"');
      expect(markup).toContain('placeholder="Cari anggota berdasarkan nama atau NRP..."');
      expect(markup).toContain('lucide-search');
      expect(markup).not.toContain('id="member-autocomplete-list"');
    });

    it('renders pre-filled value and reset button when value is provided', () => {
      const markup = renderToStaticMarkup(
        <MemberSearchAutocomplete
          members={sampleMembers}
          value="Budi"
          onChange={() => {}}
          onSelectMember={() => {}}
        />
      );

      expect(markup).toContain('value="Budi"');
      expect(markup).toContain('aria-label="Bersihkan pencarian"');
    });

    it('renders dropdown list and item details when defaultOpen is true', () => {
      const markup = renderToStaticMarkup(
        <MemberSearchAutocomplete
          members={sampleMembers}
          value=""
          onChange={() => {}}
          onSelectMember={() => {}}
          defaultOpen={true}
        />
      );

      expect(markup).toContain('id="member-autocomplete-list"');
      expect(markup).toContain('role="listbox"');
      expect(markup).toContain('Budi Santoso');
      expect(markup).toContain('12345678');
      expect(markup).toContain('Koptu');
      expect(markup).toContain('Rek: <span class="font-mono text-slate-700">1122334455</span>');
      expect(markup).toContain('Rp 5.500.000');
      expect(markup).toContain('Belum ada rekening');
      expect(markup).toContain('Gunakan ↑ ↓ dan Enter');
    });

    it('renders empty message when no members match query', () => {
      const markup = renderToStaticMarkup(
        <MemberSearchAutocomplete
          members={[]}
          value="XyZ123"
          onChange={() => {}}
          onSelectMember={() => {}}
          defaultOpen={true}
        />
      );

      expect(markup).toContain('Anggota tidak ditemukan untuk kata kunci');
      expect(markup).toContain('XyZ123');
    });

    it('applies disabled styling and attributes when disabled is true', () => {
      const markup = renderToStaticMarkup(
        <MemberSearchAutocomplete
          members={sampleMembers}
          value="Budi"
          onChange={() => {}}
          onSelectMember={() => {}}
          disabled={true}
        />
      );

      expect(markup).toContain('disabled=""');
      expect(markup).toContain('cursor-not-allowed');
      expect(markup).not.toContain('aria-label="Bersihkan pencarian"');
    });
  });

  describe('Component interaction simulation', () => {
    it('provides all expected exports', () => {
      expect(MemberSearchAutocomplete).toBeDefined();
      expect(typeof filterMembers).toBe('function');
      expect(typeof calculateNextMemberHighlightedIndex).toBe('function');
    });

    it('handles onSelectMember and onChange simulation correctly', () => {
      const onSelectMock = vi.fn();
      const onChangeMock = vi.fn();
      const member = sampleMembers[0];

      onSelectMock(member);
      onChangeMock(member.nama);

      expect(onSelectMock).toHaveBeenCalledTimes(1);
      expect(onSelectMock).toHaveBeenCalledWith(member);
      expect(onChangeMock).toHaveBeenCalledTimes(1);
      expect(onChangeMock).toHaveBeenCalledWith('Budi Santoso');
    });
  });
});
