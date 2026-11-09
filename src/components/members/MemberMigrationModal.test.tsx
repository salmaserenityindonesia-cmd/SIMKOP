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
    expect(markup).toContain('Sisa Hutang / Baki Piutang');
    expect(markup).toContain('Anggota dg Pinjaman');
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

  it('renders progress bar and status when isImporting is true with importProgress', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MemberMigrationModal, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        parseResult: dummyParseResult,
        isImporting: true,
        importProgress: { current: 50, total: 100 },
      })
    );

    expect(markup).toContain('Memproses: 50 / 100 anggota...');
    expect(markup).toContain('50%');
    expect(markup).toContain('transition-all duration-300');
    expect(markup).toContain('disabled=""'); // Buttons disabled during import
  });

  it('renders discrepancy warning badge, balanced badge, and pre-2020 badge based on savings rate tiers', () => {
    const tieredParseResult: MemberParseResult = {
      errors: [],
      rows: [
        {
          nrp: '111',
          nama: 'Budi Seimbang',
          pangkat: 'Bripda',
          bank_account_number: '111222',
          membership_status: 'ACTIVE',
          tgl_awal_anggota: '2026-09-01', // 3 bulan s/d Nov 2026 @ 200k = 600.000
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 600000,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
          jumlah_pinjaman: 0,
          tgl_awal_pinjaman: null,
          tenor: 0,
          sisa_pinjaman: 0,
          n_bulan_simpanan: 1,
          wajib_per_bulan: 600000,
          belanja_per_bulan: 0,
          lebaran_per_bulan: 0,
          n_bulan_pinjaman: 0,
          sudah_diangsur: 0,
          angsuran_lampau_per_bulan: 0,
        },
        {
          nrp: '222',
          nama: 'Chandra Selisih',
          pangkat: 'Briptu',
          bank_account_number: '222333',
          membership_status: 'ACTIVE',
          tgl_awal_anggota: '2026-09-01', // 3 bulan s/d Nov 2026 @ 200k = 600.000, di Excel 1.000.000 (Selisih +400.000)
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 1000000,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
          jumlah_pinjaman: 0,
          tgl_awal_pinjaman: null,
          tenor: 0,
          sisa_pinjaman: 0,
          n_bulan_simpanan: 1,
          wajib_per_bulan: 1000000,
          belanja_per_bulan: 0,
          lebaran_per_bulan: 0,
          n_bulan_pinjaman: 0,
          sudah_diangsur: 0,
          angsuran_lampau_per_bulan: 0,
        },
        {
          nrp: '333',
          nama: 'Dedi Veteran Pra-2020',
          pangkat: 'Aiptu',
          bank_account_number: '333444',
          membership_status: 'ACTIVE',
          tgl_awal_anggota: '2018-05-10', // Sebelum 2020
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 25000000,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
          jumlah_pinjaman: 0,
          tgl_awal_pinjaman: null,
          tenor: 0,
          sisa_pinjaman: 0,
          n_bulan_simpanan: 1,
          wajib_per_bulan: 25000000,
          belanja_per_bulan: 0,
          lebaran_per_bulan: 0,
          n_bulan_pinjaman: 0,
          sudah_diangsur: 0,
          angsuran_lampau_per_bulan: 0,
        },
      ],
    };

    const tiers = [
      {
        startYear: 2024,
        startMonth: 1,
        endYear: null,
        endMonth: null,
        monthlyAmount: 200000,
      },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(MemberMigrationModal, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        parseResult: tieredParseResult,
        isImporting: false,
        wajibRateTiers: tiers,
      })
    );

    // Audit summary bar
    expect(markup).toContain('Audit Tarif Bertingkat Simpanan Wajib');
    expect(markup).toContain('Seimbang:');
    expect(markup).toContain('Historis Pra-2020:');
    expect(markup).toContain('Terdapat Selisih:');

    // Budi Seimbang
    expect(markup).toContain('Seimbang (');

    // Chandra Selisih
    expect(markup).toContain('Selisih:');
    expect(markup).toContain('Ekspektasi sistem');

    // Dedi Veteran Pra-2020
    expect(markup).toContain('Pra-2020: Utuh');
  });
});
