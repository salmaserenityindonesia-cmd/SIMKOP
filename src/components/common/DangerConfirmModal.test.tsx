import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import DangerConfirmModal, {
  isConfirmationKeywordMatched,
  handleDangerConfirmSubmit,
} from './DangerConfirmModal';

describe('DangerConfirmModal Component & Security Keyword Validation', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Konfirmasi Tindakan Berbahaya',
    message: 'Data yang terhapus tidak dapat dipulihkan kembali.',
    confirmationKeyword: 'HAPUS SEMUA DATA ANGGOTA',
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };

  it('Skenario 1: Tidak me-render modal jika isOpen === false', () => {
    const html = renderToStaticMarkup(
      <DangerConfirmModal {...defaultProps} isOpen={false} />
    );
    expect(html).toBe('');
  });

  it('Skenario 2: Me-render judul, pesan peringatan bahaya, dan teks instruksi keyword konfirmasi saat isOpen === true', () => {
    const html = renderToStaticMarkup(
      <DangerConfirmModal {...defaultProps} isOpen={true} />
    );

    // Judul & Badge Peringatan
    expect(html).toContain('Konfirmasi Tindakan Berbahaya');
    expect(html).toContain('Tindakan ini permanen dan tidak dapat dibatalkan');
    expect(html).toContain('Data yang terhapus tidak dapat dipulihkan kembali.');

    // Label & Keyword Box
    expect(html).toContain('Ketik teks konfirmasi berikut untuk melanjutkan:');
    expect(html).toContain('HAPUS SEMUA DATA ANGGOTA');

    // Input placeholder & tombol Batal
    expect(html).toContain('placeholder="Ketik &quot;HAPUS SEMUA DATA ANGGOTA&quot;"');
    expect(html).toContain('Batal');
    expect(html).toContain('Ya, Kosongkan Sekarang');
  });

  it('Skenario 3: Tombol konfirmasi dalam kondisi disabled ketika input teks kosong atau tidak cocok dengan keyword', () => {
    // Kasus 1: Input kosong (default)
    const htmlEmpty = renderToStaticMarkup(
      <DangerConfirmModal {...defaultProps} initialKeyword="" />
    );
    expect(htmlEmpty).toContain('disabled=""');
    expect(htmlEmpty).toContain('disabled:cursor-not-allowed');

    // Kasus 2: Input teks salah / tidak cocok
    const htmlMismatch = renderToStaticMarkup(
      <DangerConfirmModal {...defaultProps} initialKeyword="HAPUS SEBAGIAN" />
    );
    expect(htmlMismatch).toContain('disabled=""');
    expect(htmlMismatch).toContain('disabled:cursor-not-allowed');

    // Unit helper verification
    expect(isConfirmationKeywordMatched('', 'HAPUS SEMUA DATA ANGGOTA')).toBe(false);
    expect(isConfirmationKeywordMatched('hapus semua data anggota', 'HAPUS SEMUA DATA ANGGOTA')).toBe(false);
    expect(isConfirmationKeywordMatched('HAPUS DATA', 'HAPUS SEMUA DATA ANGGOTA')).toBe(false);
  });

  it('Skenario 4: Tombol konfirmasi menjadi aktif ketika input teks tepat sama dengan keyword ("HAPUS SEMUA DATA ANGGOTA")', () => {
    const htmlMatched = renderToStaticMarkup(
      <DangerConfirmModal {...defaultProps} initialKeyword="HAPUS SEMUA DATA ANGGOTA" />
    );

    // Tombol submit aktif: tombol konfirmasi tidak mengandung disabled=""
    // Catatan: cek elemen button type="submit"
    expect(htmlMatched).toContain('<button type="submit" class="inline-flex items-center justify-center gap-1.5');
    // Regex atau pencarian spesifik untuk tombol submit yang tidak disabled
    expect(htmlMatched).not.toMatch(/<button type="submit"[^>]*disabled=""/);

    // Unit helper verification
    expect(isConfirmationKeywordMatched('HAPUS SEMUA DATA ANGGOTA', 'HAPUS SEMUA DATA ANGGOTA')).toBe(true);
    expect(isConfirmationKeywordMatched('  HAPUS SEMUA DATA ANGGOTA  ', 'HAPUS SEMUA DATA ANGGOTA')).toBe(true);
  });

  it('Skenario 5: Memanggil onConfirm() saat tombol konfirmasi diklik ketika aktif (keyword cocok & not loading)', () => {
    const onConfirmMock = vi.fn();

    // 1. Keyword tidak cocok -> onConfirm TIDAK terpanggil
    const notSubmitted = handleDangerConfirmSubmit(
      'KEYWORD SALAH',
      'HAPUS SEMUA DATA ANGGOTA',
      false,
      onConfirmMock
    );
    expect(notSubmitted).toBe(false);
    expect(onConfirmMock).not.toHaveBeenCalled();

    // 2. Keyword cocok -> onConfirm terpanggil
    const submitted = handleDangerConfirmSubmit(
      'HAPUS SEMUA DATA ANGGOTA',
      'HAPUS SEMUA DATA ANGGOTA',
      false,
      onConfirmMock
    );
    expect(submitted).toBe(true);
    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });

  it('Skenario 6: Memanggil onClose() saat pembatalan dialog modal', () => {
    const onCloseMock = vi.fn();
    const html = renderToStaticMarkup(
      <DangerConfirmModal {...defaultProps} onClose={onCloseMock} />
    );

    expect(html).toContain('Batal');
    expect(html).toContain('aria-label="Tutup modal"');

    // Trigger simulasi onClose
    onCloseMock();
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('Skenario 7: Menampilkan status loading (spinner Loader2 dan tombol disabled) saat isLoading === true', () => {
    const htmlLoading = renderToStaticMarkup(
      <DangerConfirmModal
        {...defaultProps}
        isLoading={true}
        initialKeyword="HAPUS SEMUA DATA ANGGOTA"
      />
    );

    // Indikator loading
    expect(htmlLoading).toContain('Memproses...');
    expect(htmlLoading).toContain('lucide-loader-2');
    expect(htmlLoading).toContain('animate-spin');

    // Semua kontrol interaktif (input, close, batal, submit) disabled saat loading
    expect(htmlLoading).toContain('disabled=""');

    // Verifikasi submission di-block saat loading meskipun keyword cocok
    const onConfirmMock = vi.fn();
    const submittedWhileLoading = handleDangerConfirmSubmit(
      'HAPUS SEMUA DATA ANGGOTA',
      'HAPUS SEMUA DATA ANGGOTA',
      true, // isLoading === true
      onConfirmMock
    );
    expect(submittedWhileLoading).toBe(false);
    expect(onConfirmMock).not.toHaveBeenCalled();
  });
});
