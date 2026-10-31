import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import LoginForm from './LoginForm';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
}));

vi.mock('../../services/settingsService', () => ({
  getKoperasiProfile: vi.fn().mockResolvedValue({
    id: 1,
    nama_koperasi: 'KOPERASI SIMPAN PINJAM MAJU',
    logo_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1234/koperasi_logo.png',
  }),
}));

describe('LoginForm Component', () => {
  it('renders login form structure with logo and credentials inputs', () => {
    const markup = renderToStaticMarkup(React.createElement(LoginForm));
    
    expect(markup).toContain('SIM Koperasi');
    expect(markup).toContain('Email / Nomor Identitas Pegawai (NIP/ID)');
    expect(markup).toContain('Kata Sandi Pengguna');
    expect(markup).toContain('Masuk ke Sistem');
    expect(markup).toContain('<img');
  });

  it('contains image element configured with fallback and proper attributes', () => {
    const markup = renderToStaticMarkup(React.createElement(LoginForm));
    
    // Initial static markup renders before useEffect runs, verifying fallback src
    expect(markup).toContain('src="/simkop_brand_logo/logo.png"');
    expect(markup).toContain('alt="SIM Koperasi"');
  });
});
