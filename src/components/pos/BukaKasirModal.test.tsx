import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BukaKasirModal from './BukaKasirModal';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    showAlert: vi.fn(),
  }),
}));

vi.mock('../../services/cashierShiftService', () => ({
  openShift: vi.fn().mockResolvedValue({
    id: 'shift-1',
    shift_number: 'SFT-20261106-001',
    initial_cash: 100000,
  }),
}));

const mockSignOut = vi.fn().mockResolvedValue({ error: null });

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: () => mockSignOut(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

describe('BukaKasirModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <BukaKasirModal
        isOpen={false}
        onSuccess={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('renders "Kembali ke Dashboard" and close button when isAdmin is true, without logout button', () => {
    const html = renderToStaticMarkup(
      <BukaKasirModal
        isOpen={true}
        onSuccess={vi.fn()}
        isAdmin={true}
        canCancel={false}
      />
    );

    expect(html).toContain('Buka Shift Kasir Baru');
    expect(html).toContain('Kembali ke Dashboard');
    expect(html).toContain('Mulai Operasional Kasir');
    expect(html).not.toContain('Keluar (Logout)');
    // Header close button is present for admin
    expect(html).toContain('close');
  });

  it('renders "Kembali ke Dashboard" when userRole is "admin"', () => {
    const html = renderToStaticMarkup(
      <BukaKasirModal
        isOpen={true}
        onSuccess={vi.fn()}
        userRole="admin"
        canCancel={false}
      />
    );

    expect(html).toContain('Kembali ke Dashboard');
    expect(html).not.toContain('Keluar (Logout)');
    expect(html).toContain('close');
  });

  it('renders "Keluar (Logout)" in footer and header when user is operator and canCancel is false', () => {
    const html = renderToStaticMarkup(
      <BukaKasirModal
        isOpen={true}
        onSuccess={vi.fn()}
        isAdmin={false}
        canCancel={false}
      />
    );

    expect(html).toContain('Buka Shift Kasir Baru');
    expect(html).not.toContain('Kembali ke Dashboard');
    // Header close (X) is not present when canCancel is false for operator
    expect(html).not.toContain('title="Tutup"');
    // But header quick logout is present
    expect(html).toContain('Keluar Akun');
    // Footer logout button is present
    expect(html).toContain('Keluar (Logout)');
    expect(html).not.toContain('Batal');
    expect(html).toContain('Mulai Operasional Kasir');
  });

  it('renders "Batal" and header close button when canCancel is true, alongside "Keluar (Logout)" for operator', () => {
    const html = renderToStaticMarkup(
      <BukaKasirModal
        isOpen={true}
        onSuccess={vi.fn()}
        userRole="operator"
        canCancel={true}
        onClose={vi.fn()}
      />
    );

    expect(html).not.toContain('Kembali ke Dashboard');
    expect(html).toContain('Keluar (Logout)');
    expect(html).toContain('Keluar Akun');
    expect(html).toContain('Batal');
    expect(html).toContain('close');
  });
});

