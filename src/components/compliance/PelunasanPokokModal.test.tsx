import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PelunasanPokokModal from './PelunasanPokokModal';
import FeedbackContext from '../../context/FeedbackContext';

describe('PelunasanPokokModal Component', () => {
  const mockMember = {
    id: 'mem-101',
    nama: 'Tom Hanks',
    nrp: '34763421',
  };

  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = (props: Partial<Parameters<typeof PelunasanPokokModal>[0]> = {}) => {
    return renderToStaticMarkup(
      <FeedbackContext.Provider
        value={{
          showToast: mockShowToast,
          showConfirm: vi.fn(),
          showAlert: vi.fn(),
        }}
      >
        <PelunasanPokokModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          member={mockMember}
          {...props}
        />
      </FeedbackContext.Provider>
    );
  };

  it('tidak menampilkan modal jika isOpen=false atau member=null', () => {
    const htmlClosed = renderComponent({ isOpen: false });
    expect(htmlClosed).toBe('');

    const htmlNoMember = renderComponent({ member: null });
    expect(htmlNoMember).toBe('');
  });

  it('merender judul, ringkasan anggota, dan input nominal pelunasan pokok saat isOpen=true', () => {
    const html = renderComponent();

    expect(html).toContain('Pelunasan Simpanan Pokok');
    expect(html).toContain('Tom Hanks');
    expect(html).toContain('34763421');
    expect(html).toContain('Pokok: Belum Lunas');
    expect(html).toContain('Nominal Simpanan Pokok (Rp)');
    expect(html).toContain('Tunai (Kasir/Kantor)');
    expect(html).toContain('Transfer Bank');
    expect(html).toContain('Konfirmasi &amp; Lunaskan');
    expect(html).toContain('Batal');
  });

  it('merender instruksi penarikan tarif dinamis aktif', () => {
    const html = renderComponent();
    expect(html).toContain('Nominal ditarik otomatis dari Konfigurasi Tarif Iuran Simpanan Pokok Aktif');
  });
});
