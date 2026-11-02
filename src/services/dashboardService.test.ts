import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDashboardStats, fetchDashboardMetrics } from './dashboardService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn()
  }
}));

describe('dashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchDashboardMetrics should be an alias of getDashboardStats', () => {
    expect(fetchDashboardMetrics).toBe(getDashboardStats);
  });

  it('harus menghitung metrik secara murni dari database ketika data tersedia', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({
              data: [
                { total_amount: 150000 },
                { total_amount: 350000 }
              ],
              error: null
            })
          })
        };
      }
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                count: 12,
                error: null
              })
            })
          })
        };
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                count: 5,
                error: null
              })
            })
          })
        };
      }
      return {};
    });

    const result = await getDashboardStats();

    expect(result.totalPenjualanHariIni).toBe(500000);
    expect(result.totalPinjamanAktif).toBe(12);
    expect(result.stokKritis).toBe(5);
    expect(result.transaksiTersimpan).toBe(0);
  });

  it('harus mengembalikan angka 0 MURNI (bukan mock 182 atau 48720500) ketika tabel kosong atau anggota di-reset', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      }
      if (table === 'loans') {
        // Ketika anggota kosong, query dengan anggota!inner menghasilkan count 0
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                count: 0,
                error: null
              })
            })
          })
        };
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                count: 0,
                error: null
              })
            })
          })
        };
      }
      return {};
    });

    const result = await getDashboardStats();

    expect(result.totalPenjualanHariIni).toBe(0);
    expect(result.totalPinjamanAktif).toBe(0);
    expect(result.stokKritis).toBe(0);
  });

  it('harus mengembalikan 0 jika database error atau query gagal (tanpa fallback mockup)', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Table sales does not exist' }
            })
          })
        };
      }
      if (table === 'transaksi') {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Table transaksi does not exist' }
            })
          })
        };
      }
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                count: null,
                error: { message: 'Connection timeout' }
              })
            })
          })
        };
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                count: null,
                error: { message: 'Column is_active does not exist' }
              })
            }),
            lte: vi.fn().mockResolvedValue({
              count: null,
              error: { message: 'Generic error' }
            })
          })
        };
      }
      return {};
    });

    const result = await getDashboardStats();

    // Wajib 0 secara murni, tidak boleh 182 atau 48720500
    expect(result.totalPenjualanHariIni).toBe(0);
    expect(result.totalPinjamanAktif).toBe(0);
    expect(result.stokKritis).toBe(0);
  });

  it('harus memvalidasi kueri loans dengan relasi anggota!inner dan filter status aktif', async () => {
    const mockLoansEq = vi.fn().mockResolvedValue({ count: 0, error: null });
    const mockLoansIn = vi.fn().mockReturnValue({ eq: mockLoansEq });
    const mockLoansSelect = vi.fn().mockReturnValue({ in: mockLoansIn });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return { select: mockLoansSelect };
      }
      return {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ count: 0, error: null })
          })
        })
      };
    });

    await getDashboardStats();

    // Pastikan kueri loans menggunakan relasi anggota!inner
    expect(supabase.from).toHaveBeenCalledWith('loans');
    expect(mockLoansSelect).toHaveBeenCalledWith('id, anggota!inner(id, status)', {
      count: 'exact',
      head: true
    });
    expect(mockLoansIn).toHaveBeenCalledWith('status', ['active', 'approved']);
    expect(mockLoansEq).toHaveBeenCalledWith('anggota.status', 'aktif');
  });

  it('harus menangani fallback kueri produk jika kolom is_active belum ada', async () => {
    const mockLteFallback = vi.fn().mockResolvedValue({ count: 8, error: null });
    const mockSelectFallback = vi.fn().mockReturnValue({ lte: mockLteFallback });

    let callCount = 0;
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'products') {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  count: null,
                  error: { message: 'column "is_active" does not exist' }
                })
              })
            })
          };
        }
        return {
          select: mockSelectFallback
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 0, error: null })
          })
        })
      };
    });

    const result = await getDashboardStats();
    expect(result.stokKritis).toBe(8);
    expect(mockLteFallback).toHaveBeenCalledWith('stock', 5);
  });
});

