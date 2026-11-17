import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MemberSelectAutosuggest, { MemberAutosuggestOption } from './MemberSelectAutosuggest';

const sampleMembers: MemberAutosuggestOption[] = [
  {
    id: 'm-1',
    nrp: '951001',
    nama: 'Dedi Kurniawan',
    pangkat: 'Sertu',
    take_home_pay: 5500000
  },
  {
    id: 'm-2',
    nrp: '951002',
    nama: 'Budi Santoso',
    pangkat: 'Kopda',
    master_thp: 4200000
  }
];

describe('MemberSelectAutosuggest', () => {
  it('renders combobox input with placeholder and search icon when no member is selected', () => {
    const html = renderToStaticMarkup(
      <MemberSelectAutosuggest
        members={sampleMembers}
        selectedMemberId=""
        onSelectMember={vi.fn()}
      />
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('placeholder="Ketik NRP, Nama Anggota, atau Pangkat..."');
    expect(html).toContain('value=""');
    expect(html).not.toContain('Hapus pilihan anggota');
  });

  it('pre-fills input value with "NRP - Nama" and renders clear button when selectedMemberId is provided', () => {
    const html = renderToStaticMarkup(
      <MemberSelectAutosuggest
        members={sampleMembers}
        selectedMemberId="m-1"
        onSelectMember={vi.fn()}
      />
    );

    expect(html).toContain('value="951001 - Dedi Kurniawan"');
    expect(html).toContain('aria-label="Hapus pilihan anggota"');
  });

  it('hides clear button and disables input when disabled is true', () => {
    const html = renderToStaticMarkup(
      <MemberSelectAutosuggest
        members={sampleMembers}
        selectedMemberId="m-2"
        onSelectMember={vi.fn()}
        disabled
      />
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('value="951002 - Budi Santoso"');
    expect(html).not.toContain('Hapus pilihan anggota');
  });
});
