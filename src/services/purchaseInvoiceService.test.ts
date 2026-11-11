import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFakturPembelian,
  catatRestockFaktur,
  getRiwayatStok,
  setMockFakturList
} from './purchaseInvoiceService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn()
    }
  };
});

describe('purchaseInvoiceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockFakturList([]);
  });

  describe('getFakturPembelian', () => {
    it('harus memuat daftar faktur dari Supabase purchases & purchase_items', async () => {
      const mockData = [
        {
          id: 'p-1',
          invoice_number: 'INV-001',
          purchase_date: '2026-11-10',
          total_amount: 100000,
          purchase_items: [
            { id: 'pi-1', product_id: 'prod-1', qty: 10, buy_price: 10000 }
          ]
        }
      ];

      const mockOrder = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const result = await getFakturPembelian();

      expect(supabase.from).toHaveBeenCalledWith('purchases');
      expect(result).toHaveLength(1);
      expect(result[0].noFaktur).toBe('INV-001');
      expect(result[0].totalNilai).toBe(100000);
      expect(result[0].items[0].produkId).toBe('prod-1');
    });

    it('harus menggunakan fallback in-memory jika terjadi error schema cache / offline', async () => {
      setMockFakturList([
        {
          id: 'mock-1',
          noFaktur: 'MOCK-001',
          tanggal: '2026-11-09',
          totalNilai: 50000,
          items: [{ produkId: 'prod-mock', qty: 5, hargaBeli: 10000 }]
        }
      ]);

      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42P01', message: 'relation "purchases" does not exist' }
      });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const result = await getFakturPembelian();
      expect(result).toHaveLength(1);
      expect(result[0].noFaktur).toBe('MOCK-001');
    });
  });

  describe('catatRestockFaktur', () => {
    it('harus memvalidasi nomor faktur dan item', async () => {
      await expect(catatRestockFaktur({
        noFaktur: '',
        tanggal: '2026-11-11',
        items: [{ produkId: 'p1', qty: 1, hargaBeli: 1000 }]
      })).rejects.toThrow('Nomor Faktur (noFaktur) harus diisi');

      await expect(catatRestockFaktur({
        noFaktur: 'FAKTUR-1',
        tanggal: '2026-11-11',
        items: []
      })).rejects.toThrow('Faktur pembelian harus memiliki minimal satu item produk.');
    });

    it('harus memanggil create_purchase_invoice_atomic RPC saat tersedia', async () => {
      const mockRpcResponse = {
        success: true,
        id: 'purch-rpc-1',
        noFaktur: 'INV-RPC-1',
        totalNilai: 200000
      };

      (supabase.rpc as any).mockResolvedValueOnce({
        data: mockRpcResponse,
        error: null
      });

      const res = await catatRestockFaktur({
        noFaktur: 'INV-RPC-1',
        tanggal: '2026-11-11',
        items: [{ produkId: 'prod-1', qty: 10, hargaBeli: 20000 }]
      });

      expect(supabase.rpc).toHaveBeenCalledWith('create_purchase_invoice_atomic', {
        p_invoice_number: 'INV-RPC-1',
        p_purchase_date: '2026-11-11',
        p_items: [{ product_id: 'prod-1', qty: 10, buy_price: 20000 }]
      });
      expect(res.id).toBe('purch-rpc-1');
      expect(res.totalNilai).toBe(200000);
    });

    it('harus fallback ke pemanggilan tabel jika RPC tidak ditemukan (PGRST202)', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function create_purchase_invoice_atomic' }
      });

      const mockPurchSingle = vi.fn().mockResolvedValue({
        data: { id: 'purch-fb-1', invoice_number: 'INV-FB-1', total_amount: 15000 },
        error: null
      });
      const mockPurchInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockPurchSingle }) });
      const mockItemsInsert = vi.fn().mockResolvedValue({ error: null });
      const mockProdSingle = vi.fn().mockResolvedValue({ data: { stock: 10 }, error: null });
      const mockProdSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: mockProdSingle }) });
      const mockProdUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'purchases') return { insert: mockPurchInsert };
        if (table === 'purchase_items') return { insert: mockItemsInsert };
        if (table === 'products') return { select: mockProdSelect, update: mockProdUpdate };
        return {};
      });

      const res = await catatRestockFaktur({
        noFaktur: 'INV-FB-1',
        tanggal: '2026-11-11',
        items: [{ produkId: 'prod-1', qty: 1, hargaBeli: 15000 }]
      });

      expect(res.id).toBe('purch-fb-1');
      expect(mockPurchInsert).toHaveBeenCalled();
      expect(mockItemsInsert).toHaveBeenCalled();
    });
  });

  describe('getRiwayatStok', () => {
    it('harus mengambil riwayat mutasi restock barang dari purchase_items', async () => {
      const mockItems = [
        {
          qty: 25,
          purchases: {
            id: 'p-1',
            invoice_number: 'FAK-123',
            purchase_date: '2026-11-10'
          }
        }
      ];

      const mockEq = vi.fn().mockResolvedValue({ data: mockItems, error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const history = await getRiwayatStok('prod-1');

      expect(supabase.from).toHaveBeenCalledWith('purchase_items');
      expect(history).toHaveLength(1);
      expect(history[0].qty).toBe(25);
      expect(history[0].tipe).toBe('in');
      expect(history[0].keterangan).toContain('FAK-123');
    });
  });
});
