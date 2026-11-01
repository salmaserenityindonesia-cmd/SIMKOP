import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import MemberMigrationModal from './MemberMigrationModal';
import { MemberParseResult } from '../../services/memberExcelService';

describe('MemberMigrationModal - 12-Column Table & As-Is Preview', () => {
  const dummyParseResult: MemberParseResult = {
    errors: [],
    rows: [
      {
        nrp: '12345',
        nama: 'Joko Ramadhan',
        pangkat: 'Bripka',
        bank_account_number: '1234567890',
        membership_status: 'ACTIVE',
        tgl_awal_anggota: '2023-01-01',
        jumlah_simpanan_pokok: 100000,
        jumlah_simpanan_wajib: 2000000,
        jumlah_simpanan_belanja: 0,
        jumlah_simpanan_lebaran: 0,
        jumlah_pinjaman: 5000000,
        tgl_awal_pinjaman: '10',
        tenor: 12,
        sisa_pinjaman: 1500000,
        n_bulan_simpanan: 1,
        wajib_per_bulan: 2000000,
        belanja_per_bulan: 0,
        lebaran_per_bulan: 0,
        n_bulan_pinjaman: 0,
        sudah_diangsur: 0,
        angsuran_lampau_per_bulan: 0
      },
      {
        nrp: '67890',
        nama: 'Asep Saputra',
        pangkat: 'Aipda',
        bank_account_number: null,
        membership_status: 'ACTIVE',
        tgl_awal_anggota: '2022-05-15',
        jumlah_simpanan_pokok: 100000,
        jumlah_simpanan_wajib: 6600000,
        jumlah_simpanan_belanja: 500000,
        jumlah_simpanan_lebaran: 300000,
        jumlah_pinjaman: 0,
        tgl_awal_pinjaman: '33',
        tenor: 0,
        sisa_pinjaman: 0,
        n_bulan_simpanan: 1,
        wajib_per_bulan: 6600000,
        belanja_per_bulan: 500000,
        lebaran_per_bulan: 300000,
        n_bulan_pinjaman: 0,
        sudah_diangsur: 0,
        angsuran_lampau_per_bulan: 0
      }
    ]
  };

  it('renders nothing when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MemberMigrationModal, {
        isOpen: false,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        parseResult: dummyParseResult,
        isImporting: false
      })
    );
    expect(markup).toBe('');
  });

  it('renders summary cards with pure Total Simpanan Wajib and without (Dibagi)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MemberMigrationModal, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        parseResult: dummyParseResult,
        isImporting: false
      })
    );

    expect(markup).toContain('Total Anggota');
    expect(markup).toContain('Simpanan Pokok');
    expect(markup).toContain('Total Simpanan Wajib');
    expect(markup).toContain('Total Pinjaman Aktif');
    expect(markup).not.toContain('(Dibagi)');
    expect(markup).not.toContain('(One-Time)');
  });

  it('renders 12 columns table header correctly', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MemberMigrationModal, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        parseResult: dummyParseResult,
        isImporting: false
      })
    );

    expect(markup).toContain('NRP / Nama');
    expect(markup).toContain('Pangkat');
    expect(markup).toContain('No. Rekening');
    expect(markup).toContain('Tgl Awal');
    expect(markup).toContain('Simp. Pokok');
    expect(markup).toContain('Simp. Wajib');
    expect(markup).toContain('Simp. Belanja');
    expect(markup).toContain('Simp. Lebaran');
    expect(markup).toContain('Jml Pinjaman');
    expect(markup).toContain('Tgl Awal Pinj.');
    expect(markup).toContain('Tenor');
    expect(markup).toContain('Sisa Pinjaman');
  });

  it('renders row data as-is without formulas, showing full amounts and raw tgl_awal_pinjaman', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MemberMigrationModal, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        parseResult: dummyParseResult,
        isImporting: false
      })
    );

    // Joko Ramadhan: Simp Wajib Rp 2.000.000, Tgl Awal Pinj "10", Tenor "12 bln"
    expect(markup).toContain('Joko Ramadhan');
    expect(markup).toContain('10'); // Raw tgl_awal_pinjaman
    expect(markup).toContain('12 bln');
    expect(markup).not.toContain('/bln');
    expect(markup).not.toContain('Selama');
    expect(markup).not.toContain('bln lampau');

    // Asep Saputra: Simp Wajib Rp 6.600.000, Tgl Awal Pinj "33", Tenor '-'
    expect(markup).toContain('Asep Saputra');
    expect(markup).toContain('33'); // Raw tgl_awal_pinjaman
  });

  it('includes overflow-x-auto, max-h-[55vh], and max-w-7xl classes for responsive scrolling', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MemberMigrationModal, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        parseResult: dummyParseResult,
        isImporting: false
      })
    );

    expect(markup).toContain('max-w-7xl');
    expect(markup).toContain('overflow-x-auto border rounded-xl max-h-[55vh] shadow-xs');
  });
});
