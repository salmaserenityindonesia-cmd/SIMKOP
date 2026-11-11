import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PenarikanSimpanan from './index';

// Mock AdminLayout
vi.mock('../../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock Supabase
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          or: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null })
          }))
        }))
      }))
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-001' } }, error: null })
    }
  }
}));

describe('PenarikanSimpanan Page with Navigation Tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders both navigation tabs for regular withdrawal and bulk lebaran disbursement', () => {
    const html = renderToStaticMarkup(<PenarikanSimpanan />);

    // Header & Breadcrumb
    expect(html).toContain('Penarikan &amp; Pencairan Simpanan');
    
    // Tab 1: Penarikan Perorangan (Reguler)
    expect(html).toContain('Penarikan Perorangan (Reguler)');

    // Tab 2: Pencairan Massal Simpanan Lebaran
    expect(html).toContain('Pencairan Massal Simpanan Lebaran');
    expect(html).toContain('THR');

    // Default active tab should render regular search input
    expect(html).toContain('Cari NRP atau Nama Anggota...');
  });
});
