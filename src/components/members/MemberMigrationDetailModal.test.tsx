import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import MemberMigrationDetailModal from './MemberMigrationDetailModal';
import { Anggota } from '../../services/koperasiService';

describe('MemberMigrationDetailModal - Snapshot Data Migrasi Awal Anggota', () => {
  const dummyMember: Anggota = {
    id: 'member-123',
    nrp: '78010234',
    nama: 'Bripka Joko Susilo',
    pangkat: 'Bripka',
    bank_account_number: '9876543210',
    membership_status: 'ACTIVE',
    status: 'aktif',
    created_at: '2023-01-15T00:00:00.000Z'
  };

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={false}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );
    expect(html).toBe('');
  });

  it('renders nothing when member is null', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={null}
      />
    );
    expect(html).toBe('');
  });

  it('renders header with NRP, nama, and 14-kolom badge when open', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Rincian Data Migrasi Awal Anggota');
    expect(html).toContain('14 Kolom Snapshot');
    expect(html).toContain('78010234');
    expect(html).toContain('Bripka Joko Susilo');
  });

  it('renders Card 1 with member profile and employment details', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Card 1: Profil &amp; Kepegawaian');
    expect(html).toContain('78010234');
    expect(html).toContain('Bripka Joko Susilo');
    expect(html).toContain('Bripka');
    expect(html).toContain('9876543210');
    expect(html).toContain('ACTIVE');
  });

  it('renders Card 2 with initial migration deposits and total', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Card 2: Simpanan Awal Migrasi');
    expect(html).toContain('Simpanan Pokok');
    expect(html).toContain('Simpanan Wajib (Utuh)');
    expect(html).toContain('Simpanan Belanja');
    expect(html).toContain('Simpanan Lebaran');
    expect(html).toContain('Total Akumulasi Simpanan Awal');
  });

  it('renders Card 3 with neutral badge when member has no loan', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Card 3: Pinjaman Bawaan Migrasi');
    expect(html).toContain('Tidak Memiliki Pinjaman Bawaan Migrasi');
  });

  it('renders footer with historical snapshot explanation and close button', () => {
    const html = renderToStaticMarkup(
      <MemberMigrationDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={dummyMember}
      />
    );

    expect(html).toContain('Data ini merupakan catatan historis snapshot migrasi anggota (14 Kolom Template)');
    expect(html).toContain('Tutup');
  });
});
