import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFakturPembelian,
  catatRestockFaktur,
  getRiwayatStok,
  generateNextPurchaseInvoiceNumber,
  isPurchaseInvoiceNumberExists,
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

  describe('generateNextPurchaseInvoiceNumber', () => {
    it('harus menghasilkan PB/YYYYMMDD/001 jika belum ada faktur pada tanggal tersebut', async () => {
      const mockIlike = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockSelect = vi.fn().mockReturnValue({ ilike: mockIlike });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const result = await generateNextPurchaseInvoiceNumber('2026-11-22');

      expect(supabase.from).toHaveBeenCalledWith('purchases');
      expect(mockSelect).toHaveBeenCalledWith('invoice_number');
      expect(mockIlike).toHaveBeenCalledWith('invoice_number', 'PB/20261122/%');
      expect(result).toBe('PB/20261122/001');
    });

    it('harus mengambil nomor urut maksimum + 1 dan mengabaikan suffix non-numerik', async () => {
      const mockData = [
        { invoice_number: 'PB/20261122/001' },
        { invoice_number: 'PB/20261122/003' },
        { invoice_number: 'PB/20261122/ABC' }
      ];
      const mockIlike = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ ilike: mockIlike });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const result = await generateNextPurchaseInvoiceNumber('2026-11-22');

      expect(result).toBe('PB/20261122/004');
    });

    it('harus mereset nomor urut ke 001 untuk tanggal yang berbeda', async () => {
      const mockIlike = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockSelect = vi.fn().mockReturnValue({ ilike: mockIlike });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const result = await generateNextPurchaseInvoiceNumber('2026-11-23');

      expect(mockIlike).toHaveBeenCalledWith('invoice_number', 'PB/20261123/%');
      expect(result).toBe('PB/20261123/001');
    });

    it('harus fallback ke mockFakturList saat terjadi error schema cache / offline', async () => {
      setMockFakturList([
        {
          id: 'mock-1',
          noFaktur: 'PB/20261122/001',
          tanggal: '2026-11-22',
          totalNilai: 50000,
          items: []
        },
        {
          id: 'mock-2',
          noFaktur: 'PB/20261122/002',
          tanggal: '2026-11-22',
          totalNilai: 75000,
          items: []
        },
        {
          id: 'mock-3',
          noFaktur: 'PB/20261123/005',
          tanggal: '2026-11-23',
          totalNilai: 10000,
          items: []
        }
      ]);

      const mockIlike = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42P01', message: 'relation "purchases" does not exist' }
      });
      const mockSelect = vi.fn().mockReturnValue({ ilike: mockIlike });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const result = await generateNextPurchaseInvoiceNumber('2026-11-22');

      expect(result).toBe('PB/20261122/003');
    });
  });

  describe('isPurchaseInvoiceNumberExists', () => {
    it('harus mengembalikan true jika nomor faktur sudah ada di database', async () => {
      const mockLimit = vi.fn().mockResolvedValue({ data: [{ id: 'p-1' }], error: null });
      const mockEq = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const exists = await isPurchaseInvoiceNumberExists(' PB/20261122/001 ');

      expect(supabase.from).toHaveBeenCalledWith('purchases');
      expect(mockSelect).toHaveBeenCalledWith('id');
      expect(mockEq).toHaveBeenCalledWith('invoice_number', 'PB/20261122/001');
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(exists).toBe(true);
    });

    it('harus mengembalikan false jika nomor faktur belum terdaftar', async () => {
      const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockEq = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const exists = await isPurchaseInvoiceNumberExists('PB/20261122/099');

      expect(exists).toBe(false);
    });

    it('harus fallback ke mockFakturList saat terjadi error schema cache / offline', async () => {
      setMockFakturList([
        {
          id: 'mock-1',
          noFaktur: 'PB/20261122/001',
          tanggal: '2026-11-22',
          totalNilai: 50000,
          items: []
        }
      ]);

      const mockLimit = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42P01', message: 'relation "purchases" does not exist' }
      });
      const mockEq = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      await expect(isPurchaseInvoiceNumberExists('pb/20261122/001')).resolves.toBe(true);
      await expect(isPurchaseInvoiceNumberExists('PB/20261122/002')).resolves.toBe(false);
    });
  });
});

