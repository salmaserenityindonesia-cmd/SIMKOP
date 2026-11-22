import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import PosMemberSearch, {
  PosMember,
  MAX_POS_MEMBER_SUGGESTIONS,
  filterPosMembers,
  getNextHighlightedIndex,
} from './PosMemberSearch';

describe('PosMemberSearch - Multi-field POS member autosuggest', () => {
  const sampleMembers: PosMember[] = [
    {
      id: 'mem-uuid-001',
      nomor_referensi: 'REF-001',
      nrp: '85020954',
      nama: 'HARIYANTO',
    },
    {
      id: 'mem-uuid-002',
      nomor_referensi: 'REF-002',
      nrp: '87011223',
      nama: 'SITI AMINAH',
    },
    {
      id: 'mem-uuid-003',
      no_referensi: '003',
      nrp: '90044556',
      nama: 'BUDI SANTOSO',
    },
  ];

  describe('filterPosMembers helper', () => {
    it('matches by nomor_referensi with or without REF- prefix', () => {
      const withPrefix = filterPosMembers(sampleMembers, 'REF-001');
      expect(withPrefix.totalMatches).toBe(1);
      expect(withPrefix.items[0].nama).toBe('HARIYANTO');

      const withoutPrefix = filterPosMembers(sampleMembers, '001');
      expect(withoutPrefix.totalMatches).toBe(1);
      expect(withoutPrefix.items[0].nama).toBe('HARIYANTO');

      const searchPrefixAgainstPlainRef = filterPosMembers(sampleMembers, 'REF-003');
      expect(searchPrefixAgainstPlainRef.totalMatches).toBe(1);
      expect(searchPrefixAgainstPlainRef.items[0].nama).toBe('BUDI SANTOSO');
    });

    it('matches by member id', () => {
      const res = filterPosMembers(sampleMembers, 'mem-uuid-002');
      expect(res.totalMatches).toBe(1);
      expect(res.items[0].nama).toBe('SITI AMINAH');
    });

    it('matches by partial NRP', () => {
      const res = filterPosMembers(sampleMembers, '8502');
      expect(res.totalMatches).toBe(1);
      expect(res.items[0].nrp).toBe('85020954');
    });

    it('matches by partial nama case-insensitively', () => {
      const res = filterPosMembers(sampleMembers, 'hari');
      expect(res.totalMatches).toBe(1);
      expect(res.items[0].nama).toBe('HARIYANTO');
    });

    it('returns up to limit for empty query and empty list for non-matching query', () => {
      const emptyQuery = filterPosMembers(sampleMembers, '   ');
      expect(emptyQuery.items).toHaveLength(3);
      expect(emptyQuery.totalMatches).toBe(3);

      const noMatch = filterPosMembers(sampleMembers, 'TIDAK_ADA_ANGGOTA');
      expect(noMatch.items).toHaveLength(0);
      expect(noMatch.totalMatches).toBe(0);
    });

    it('caps displayed items at 15 while preserving totalMatches count', () => {
      const manyMembers: PosMember[] = Array.from({ length: 22 }, (_, i) => ({
        id: `id-${i + 1}`,
        nomor_referensi: `REF-${String(i + 1).padStart(3, '0')}`,
        nrp: `8800${String(i + 1).padStart(4, '0')}`,
        nama: `ANGGOTA TEST ${i + 1}`,
      }));

      const res = filterPosMembers(manyMembers, 'ANGGOTA');
      expect(MAX_POS_MEMBER_SUGGESTIONS).toBe(15);
      expect(res.items).toHaveLength(15);
      expect(res.totalMatches).toBe(22);
    });
  });

  describe('getNextHighlightedIndex keyboard navigation', () => {
    it('handles ArrowDown and ArrowUp transitions and clamps boundaries', () => {
      expect(getNextHighlightedIndex(-1, 5, 'ArrowDown')).toBe(0);
      expect(getNextHighlightedIndex(1, 5, 'ArrowDown')).toBe(2);
      expect(getNextHighlightedIndex(4, 5, 'ArrowDown')).toBe(4);

      expect(getNextHighlightedIndex(-1, 5, 'ArrowUp')).toBe(4);
      expect(getNextHighlightedIndex(2, 5, 'ArrowUp')).toBe(1);
      expect(getNextHighlightedIndex(0, 5, 'ArrowUp')).toBe(0);
    });

    it('returns -1 when total items is 0', () => {
      expect(getNextHighlightedIndex(0, 0, 'ArrowDown')).toBe(-1);
      expect(getNextHighlightedIndex(0, 0, 'ArrowUp')).toBe(-1);
    });
  });

  describe('Static markup rendering', () => {
    it('renders accessible combobox input when no member is selected', () => {
      const markup = renderToStaticMarkup(
        <PosMemberSearch
          members={sampleMembers}
          selectedMember={null}
          onSelectMember={() => {}}
        />
      );

      expect(markup).toContain('role="combobox"');
      expect(markup).toContain('aria-autocomplete="list"');
      expect(markup).toContain('placeholder="Ketik No. ID / Ref, NRP, atau Nama Anggota..."');
      expect(markup).toContain('lucide-search');
      expect(markup).not.toContain('id="pos-member-listbox"');
    });

    it('renders suggestion listbox with badges and overflow indicator when defaultOpen is true', () => {
      const manyMembers: PosMember[] = Array.from({ length: 18 }, (_, i) => ({
        id: `id-${i + 1}`,
        nomor_referensi: `REF-${String(i + 1).padStart(3, '0')}`,
        nrp: `850209${String(i + 1).padStart(2, '0')}`,
        nama: `HARIYANTO ${i + 1}`,
      }));

      const markup = renderToStaticMarkup(
        <PosMemberSearch
          members={manyMembers}
          selectedMember={null}
          onSelectMember={() => {}}
          defaultOpen={true}
        />
      );

      expect(markup).toContain('id="pos-member-listbox"');
      expect(markup).toContain('role="listbox"');
      expect(markup).toContain('REF-001');
      expect(markup).toContain('85020901');
      expect(markup).toContain('HARIYANTO 1');
      expect(markup).toContain('Menampilkan 15 dari 18 anggota cocok');
    });

    it('renders selected member card with REF badge, NRP, nama, Ganti button, and financials', () => {
      const markup = renderToStaticMarkup(
        <PosMemberSearch
          members={sampleMembers}
          selectedMember={sampleMembers[0]}
          onSelectMember={() => {}}
          memberFinancials={{
            belanjaBalance: 350000,
            remainingCreditLimit: 1250000,
            thpSafetyThreshold: 1500000,
          }}
        />
      );

      expect(markup).toContain('REF-001');
      expect(markup).toContain('85020954');
      expect(markup).toContain('HARIYANTO');
      expect(markup).toContain('aria-label="Ganti / Cari Lain"');
      expect(markup).toContain('Ganti');
      expect(markup).toContain('Simpanan Belanja');
      expect(markup).toContain('Rp 350.000');
      expect(markup).toContain('Limit Bon Toko');
      expect(markup).toContain('Rp 1.250.000');
    });
  });
});
