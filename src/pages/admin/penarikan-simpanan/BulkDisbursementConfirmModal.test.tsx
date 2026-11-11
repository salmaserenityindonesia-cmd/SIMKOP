import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import BulkDisbursementConfirmModal from './BulkDisbursementConfirmModal';

describe('BulkDisbursementConfirmModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    totalMembers: 124,
    totalAmount: 186000000,
    isSubmitting: false,
    error: null,
    defaultCycleName: 'Pencairan THR Idul Fitri 2026',
    defaultCutOffDate: '2026-03-25'
  };

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <BulkDisbursementConfirmModal {...defaultProps} isOpen={false} />
    );
    expect(html).toBe('');
  });

  it('renders critical warning, cycle details, and verification input when isOpen is true', () => {
    const html = renderToStaticMarkup(
      <BulkDisbursementConfirmModal {...defaultProps} />
    );

    // Header & Warning
    expect(html).toContain('Konfirmasi Eksekusi Pencairan Massal');
    expect(html).toContain('PERINGATAN KRITIS');
    expect(html).toContain('Tindakan ini akan mencairkan 100% saldo simpanan lebaran untuk seluruh anggota aktif dan mereset saldo menjadi Rp 0.');

    // Metrics
    expect(html).toContain('124 Anggota');
    expect(html).toContain('186.000.000');

    // Required Phrase
    expect(html).toContain('CAIRKAN LEBARAN');
    expect(html).toContain('Ketik &quot;CAIRKAN LEBARAN&quot;');

    // Submit button text
    expect(html).toContain('Konfirmasi &amp; Eksekusi Sekarang');
  });

  it('renders error message when error prop is present', () => {
    const html = renderToStaticMarkup(
      <BulkDisbursementConfirmModal {...defaultProps} error="Gagal menghubungkan RPC Database" />
    );

    expect(html).toContain('Gagal menghubungkan RPC Database');
  });

  it('renders loading indicator when isSubmitting is true', () => {
    const html = renderToStaticMarkup(
      <BulkDisbursementConfirmModal {...defaultProps} isSubmitting={true} />
    );

    expect(html).toContain('Sedang Memproses Pencairan Massal...');
    expect(html).toContain('Mengeksekusi...');
  });
});
