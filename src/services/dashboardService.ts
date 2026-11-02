import { supabase } from '../lib/supabaseClient';

export interface DashboardStats {
  totalPenjualanHariIni: number;
  totalPinjamanAktif: number;
  stokKritis: number;
  transaksiTersimpan: number;
}

/**
 * Mengambil metrik operasional dashboard admin murni dari database Supabase
 * tanpa fallback mock data statis (mengeliminasi orphan records).
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  let totalPenjualanHariIni = 0;
  let totalPinjamanAktif = 0;
  let stokKritis = 0;

  // 1. Total Penjualan Hari Ini (murni dari database tabel sales POS)
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('total_amount')
      .gte('created_at', `${today}T00:00:00.000Z`);

    if (!salesError && sales) {
      totalPenjualanHariIni = sales.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
    } else if (salesError) {
      // Fallback kueri jika masih menggunakan skema legacy tabel 'transaksi'
      const { data: legacySales, error: legacyError } = await supabase
        .from('transaksi')
        .select('total')
        .gte('created_at', `${today}T00:00:00.000Z`);

      if (!legacyError && legacySales) {
        totalPenjualanHariIni = legacySales.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
      } else {
        totalPenjualanHariIni = 0;
      }
    }
  } catch (err) {
    console.error('Error fetching today sales:', err);
    totalPenjualanHariIni = 0;
  }

  // 2. Pinjaman Aktif: Hubungkan kueri loans dengan tabel master anggota
  // Dengan klausul anggota!inner, jika tabel anggota kosong atau berstatus non-aktif,
  // maka jumlah pinjaman aktif dijamin pasti bernilai 0 dan mengeliminasi orphan loans.
  try {
    const { count, error: loanError } = await supabase
      .from('loans')
      .select('id, anggota!inner(id, status)', { count: 'exact', head: true })
      .in('status', ['active', 'approved'])
      .eq('anggota.status', 'aktif');

    if (!loanError && count !== null) {
      totalPinjamanAktif = count;
    } else {
      if (loanError) {
        console.warn('Query active loans with inner join returned error, evaluating to 0:', loanError.message);
      }
      totalPinjamanAktif = 0;
    }
  } catch (err) {
    console.error('Error fetching active loans count:', err);
    totalPinjamanAktif = 0;
  }

  // 3. Stok Kritis: Ambil murni dari tabel public.products di mana stok <= 5
  try {
    const { count: criticalStockCount, error: stockError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .lte('stock', 5);

    if (!stockError && criticalStockCount !== null) {
      stokKritis = criticalStockCount;
    } else {
      // Fallback kueri jika kolom is_active belum ada pada tabel products
      const { count: fallbackCount, error: fallbackError } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .lte('stock', 5);

      if (!fallbackError && fallbackCount !== null) {
        stokKritis = fallbackCount;
      } else {
        if (stockError || fallbackError) {
          console.warn('Query critical stock returned error, evaluating to 0:', (stockError || fallbackError)?.message);
        }
        stokKritis = 0;
      }
    }
  } catch (err) {
    console.error('Error fetching critical stock count:', err);
    stokKritis = 0;
  }

  return {
    totalPenjualanHariIni,
    totalPinjamanAktif,
    stokKritis,
    transaksiTersimpan: 0 // Dihandle oleh UI via cartStore
  };
}

/**
 * Alias fungsi untuk fetchDashboardMetrics sesuai spesifikasi task
 */
export const fetchDashboardMetrics = getDashboardStats;
