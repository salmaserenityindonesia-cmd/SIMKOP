import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updatePurchaseInvoice,
  getPurchaseAuditLogs,
  resetPurchaseServiceMockState,
  setMockProducts,
  getMockProducts,
  setMockPurchases,
  getMockPurchases,
  setMockAuditLogs,
  getMockAuditLogs,
  UpdatePurchasePayload
} from './purchaseService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn()
  }
}));

describe('purchaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPurchaseServiceMockState();
  });

  describe('updatePurchaseInvoice - Validation Checks', () => {
    const validUser = { id: 'admin-uuid-1', name: 'Budi Santoso' };
    const validPayload: UpdatePurchasePayload = {
      noFaktur: 'INV-2026-001-REV',
      tanggal: '2026-10-26',
      items: [
        { produkId: 'prod-1', qty: 12, hargaBeli: 72000 }
      ]
    };

    it('should throw an error if purchaseId is empty or whitespace', async () => {
      await expect(
        updatePurchaseInvoice('', validPayload, 'Koreksi kuantitas barang sesuai DO', validUser)
      ).rejects.toThrow('ID faktur pembelian harus disertakan.');

      await expect(
        updatePurchaseInvoice('   ', validPayload, 'Koreksi kuantitas barang sesuai DO', validUser)
      ).rejects.toThrow('ID faktur pembelian harus disertakan.');
    });

    it('should throw an error if changeReason is missing or less than 10 characters', async () => {
      await expect(
        updatePurchaseInvoice('faktur-1', validPayload, '', validUser)
      ).rejects.toThrow('Alasan perubahan minimal 10 karakter.');

      await expect(
        updatePurchaseInvoice('faktur-1', validPayload, 'pendek', validUser)
      ).rejects.toThrow('Alasan perubahan minimal 10 karakter.');

      await expect(
        updatePurchaseInvoice('faktur-1', validPayload, '123456789', validUser)
      ).rejects.toThrow('Alasan perubahan minimal 10 karakter.');
    });

    it('should throw an error if invoice number (noFaktur) is empty', async () => {
      const invalidPayload = { ...validPayload, noFaktur: '   ' };
      await expect(
        updatePurchaseInvoice('faktur-1', invalidPayload, 'Koreksi faktur nomor kosong', validUser)
      ).rejects.toThrow('Nomor faktur pembelian harus diisi.');
    });

    it('should throw an error if items array is empty or missing', async () => {
      const payloadNoItems = { ...validPayload, items: [] };
      await expect(
        updatePurchaseInvoice('faktur-1', payloadNoItems, 'Koreksi item faktur kosong', validUser)
      ).rejects.toThrow('Faktur pembelian harus memiliki minimal satu item produk.');
    });

    it('should throw an error if an item is missing produkId', async () => {
      const invalidItemPayload: UpdatePurchasePayload = {
        ...validPayload,
        items: [{ produkId: '', qty: 5, hargaBeli: 10000 }]
      };
      await expect(
        updatePurchaseInvoice('faktur-1', invalidItemPayload, 'Koreksi produk ID kosong', validUser)
      ).rejects.toThrow('Setiap item faktur harus memiliki ID produk.');
    });

    it('should throw an error if item quantity is zero or negative', async () => {
      const zeroQtyPayload: UpdatePurchasePayload = {
        ...validPayload,
        items: [{ produkId: 'prod-1', qty: 0, hargaBeli: 10000 }]
      };
      await expect(
        updatePurchaseInvoice('faktur-1', zeroQtyPayload, 'Koreksi kuantitas nol', validUser)
      ).rejects.toThrow('Kuantitas setiap item produk harus lebih besar dari 0.');

      const negativeQtyPayload: UpdatePurchasePayload = {
        ...validPayload,
        items: [{ produkId: 'prod-1', qty: -5, hargaBeli: 10000 }]
      };
      await expect(
        updatePurchaseInvoice('faktur-1', negativeQtyPayload, 'Koreksi kuantitas negatif', validUser)
      ).rejects.toThrow('Kuantitas setiap item produk harus lebih besar dari 0.');
    });

    it('should throw an error if item buy price is negative', async () => {
      const negativePricePayload: UpdatePurchasePayload = {
        ...validPayload,
        items: [{ produkId: 'prod-1', qty: 5, hargaBeli: -1000 }]
      };
      await expect(
        updatePurchaseInvoice('faktur-1', negativePricePayload, 'Koreksi harga beli negatif', validUser)
      ).rejects.toThrow('Harga beli item produk tidak boleh negatif.');
    });
  });

  describe('updatePurchaseInvoice - Supabase RPC Execution', () => {
    const validUser = { id: 'admin-uuid-1', name: 'Budi Santoso' };
    const validPayload: UpdatePurchasePayload = {
      noFaktur: 'INV-2026-001-REV',
      tanggal: '2026-10-26',
      items: [
        { produkId: 'prod-1', qty: 15, hargaBeli: 75000 }
      ]
    };

    it('should successfully update purchase invoice via atomic RPC when database is connected', async () => {
      const mockRpcResponse = {
        success: true,
        purchase_id: 'faktur-1',
        invoice_number: 'INV-2026-001-REV',
        total_amount: 1125000,
        audit_log_id: 'audit-log-uuid-1',
        updated_at: '2026-10-26T10:00:00Z'
      };

      (supabase.rpc as any).mockResolvedValue({
        data: mockRpcResponse,
        error: null
      });

      const result = await updatePurchaseInvoice(
        'faktur-1',
        validPayload,
        'Penyesuaian kuantitas fisik dan harga per unit',
        validUser
      );

      expect(supabase.rpc).toHaveBeenCalledWith('update_purchase_invoice_atomic', {
        p_purchase_id: 'faktur-1',
        p_invoice_number: 'INV-2026-001-REV',
        p_purchase_date: '2026-10-26',
        p_items: [
          { product_id: 'prod-1', qty: 15, buy_price: 75000 }
        ],
        p_change_reason: 'Penyesuaian kuantitas fisik dan harga per unit',
        p_user_id: 'admin-uuid-1',
        p_user_name: 'Budi Santoso'
      });

      expect(result).toEqual(mockRpcResponse);
      expect(result.success).toBe(true);
      expect(result.total_amount).toBe(1125000);
    });

    it('should throw immediately without fallback if RPC returns business exception (code P0001)', async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Stok produk "Beras Premium 5kg" tidak mencukupi untuk dikurangi. Sebagian barang sudah terjual.'
        }
      });

      await expect(
        updatePurchaseInvoice(
          'faktur-1',
          validPayload,
          'Penyesuaian kuantitas faktur yang sudah terjual',
          validUser
        )
      ).rejects.toThrow('Stok produk "Beras Premium 5kg" tidak mencukupi untuk dikurangi');
    });
  });

  describe('updatePurchaseInvoice - Offline Fallback & Stock Reconciliation', () => {
    const validUser = { id: 'admin-uuid-1', name: 'Budi Santoso' };

    beforeEach(() => {
      // Setup RPC to simulate offline/schema cache error
      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.update_purchase_invoice_atomic in the schema cache'
        }
      });

      // Set initial mock state:
      // prod-1: stock 20, buy_price 70000
      // prod-2: stock 15, buy_price 30000
      // prod-3: stock 3, buy_price 12000
      setMockProducts([
        { id: 'prod-1', name: 'Beras Premium 5kg', buy_price: 70000, stock: 20 },
        { id: 'prod-2', name: 'Minyak Goreng 2L', buy_price: 30000, stock: 15 },
        { id: 'prod-3', name: 'Gula Pasir 1kg', buy_price: 12000, stock: 3 },
      ]);

      // faktur-1 originally has 1 item: prod-1 qty 10, hargaBeli 70000 (total: 700000)
      setMockPurchases([
        {
          id: 'faktur-1',
          noFaktur: 'INV-2026-001',
          tanggal: '2026-10-25',
          totalNilai: 700000,
          items: [
            { id: 'item-1', produkId: 'prod-1', qty: 10, hargaBeli: 70000 }
          ]
        }
      ]);

      setMockAuditLogs([]);
    });

    it('should reconcile stock addition (delta positive) and recalculate total invoice amount', async () => {
      // Old qty for prod-1 was 10. New qty is 14. Delta = +4.
      // Initial prod-1 stock is 20 -> expected new stock is 24.
      // New buy_price is 75000. Total = 14 * 75000 = 1050000.
      const payload: UpdatePurchasePayload = {
        noFaktur: 'INV-2026-001-EDITED',
        tanggal: '2026-10-27',
        items: [
          { produkId: 'prod-1', qty: 14, hargaBeli: 75000 }
        ]
      };

      const result = await updatePurchaseInvoice(
        'faktur-1',
        payload,
        'Penambahan stok barang karena ada bonus dari supplier',
        validUser
      );

      expect(result.success).toBe(true);
      expect(result.invoice_number).toBe('INV-2026-001-EDITED');
      expect(result.total_amount).toBe(1050000);

      // Verify product stock and price updated
      const updatedProducts = getMockProducts();
      const prod1 = updatedProducts.find(p => p.id === 'prod-1')!;
      expect(prod1.stock).toBe(24);
      expect(prod1.buy_price).toBe(75000);

      // Verify purchase updated in store
      const updatedPurchases = getMockPurchases();
      const purchase = updatedPurchases.find(p => p.id === 'faktur-1')!;
      expect(purchase.noFaktur).toBe('INV-2026-001-EDITED');
      expect(purchase.totalNilai).toBe(1050000);
      expect(purchase.items[0].qty).toBe(14);
      expect(purchase.items[0].hargaBeli).toBe(75000);

      // Verify audit log recorded
      const logs = getMockAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].entity_id).toBe('faktur-1');
      expect(logs[0].action).toBe('UPDATE_PURCHASE');
      expect(logs[0].performer_name).toBe('Budi Santoso');
      expect(logs[0].notes).toBe('Penambahan stok barang karena ada bonus dari supplier');
      expect(logs[0].old_data.purchase.total_amount).toBe(700000);
      expect(logs[0].new_data.purchase.total_amount).toBe(1050000);
    });

    it('should reconcile stock reduction (delta negative) safely when stock is sufficient', async () => {
      // Old qty for prod-1 was 10. New qty is 6. Delta = -4.
      // Initial prod-1 stock is 20 -> expected new stock is 16.
      // New buy_price is 70000. Total = 6 * 70000 = 420000.
      const payload: UpdatePurchasePayload = {
        noFaktur: 'INV-2026-001',
        tanggal: '2026-10-25',
        items: [
          { produkId: 'prod-1', qty: 6, hargaBeli: 70000 }
        ]
      };

      const result = await updatePurchaseInvoice(
        'faktur-1',
        payload,
        'Pengurangan kuantitas karena 4 pcs barang cacat dikembalikan',
        validUser
      );

      expect(result.success).toBe(true);
      expect(result.total_amount).toBe(420000);

      const prod1 = getMockProducts().find(p => p.id === 'prod-1')!;
      expect(prod1.stock).toBe(16);
    });

    it('should reject update if stock reduction causes stock to become negative', async () => {
      // Suppose prod-1 stock is only 2 currently in warehouse (e.g. 8 pcs were already sold).
      // Old invoice qty was 10. User tries to reduce invoice qty to 3 (delta = -7).
      // But stock is only 2: 2 + (-7) = -5 < 0. Should be rejected!
      setMockProducts([
        { id: 'prod-1', name: 'Beras Premium 5kg', buy_price: 70000, stock: 2 }
      ]);

      const payload: UpdatePurchasePayload = {
        noFaktur: 'INV-2026-001',
        tanggal: '2026-10-25',
        items: [
          { produkId: 'prod-1', qty: 3, hargaBeli: 70000 }
        ]
      };

      await expect(
        updatePurchaseInvoice(
          'faktur-1',
          payload,
          'Koreksi pengurangan faktur tetapi barang sudah terjual',
          validUser
        )
      ).rejects.toThrow(
        'Stok produk "Beras Premium 5kg" tidak mencukupi untuk dikurangi. Stok saat ini: 2, dibutuhkan pengurangan: 7. Sebagian barang sudah terjual.'
      );

      // Verify product stock remains unchanged
      const prod1 = getMockProducts().find(p => p.id === 'prod-1')!;
      expect(prod1.stock).toBe(2);

      // Verify no audit log added
      expect(getMockAuditLogs()).toHaveLength(0);
    });

    it('should correctly handle multi-item additions and removals in a single invoice', async () => {
      // Existing: prod-1 qty 10.
      // Updated: prod-1 qty 8 (delta -2, stock 20 -> 18)
      //          prod-2 qty 5 (delta +5, stock 15 -> 20, buy_price 31000)
      const multiPayload: UpdatePurchasePayload = {
        noFaktur: 'INV-2026-001-MULTI',
        tanggal: '2026-10-28',
        items: [
          { produkId: 'prod-1', qty: 8, hargaBeli: 70000 },
          { produkId: 'prod-2', qty: 5, hargaBeli: 31000 }
        ]
      };

      const result = await updatePurchaseInvoice(
        'faktur-1',
        multiPayload,
        'Penyesuaian faktur multi-item: kurangi beras dan tambahkan minyak',
        validUser
      );

      expect(result.success).toBe(true);
      // Expected total: (8 * 70000) + (5 * 31000) = 560000 + 155000 = 715000
      expect(result.total_amount).toBe(715000);

      const products = getMockProducts();
      const prod1 = products.find(p => p.id === 'prod-1')!;
      const prod2 = products.find(p => p.id === 'prod-2')!;

      expect(prod1.stock).toBe(18);
      expect(prod2.stock).toBe(20);
      expect(prod2.buy_price).toBe(31000);
    });

    it('should throw an error if purchase record is not found in mock state', async () => {
      const payload: UpdatePurchasePayload = {
        noFaktur: 'INV-NOT-FOUND',
        tanggal: '2026-10-25',
        items: [{ produkId: 'prod-1', qty: 5, hargaBeli: 70000 }]
      };

      await expect(
        updatePurchaseInvoice(
          'non-existent-faktur',
          payload,
          'Mencoba mengubah faktur yang tidak ada di database',
          validUser
        )
      ).rejects.toThrow('Faktur pembelian dengan ID non-existent-faktur tidak ditemukan.');
    });
  });

  describe('getPurchaseAuditLogs', () => {
    it('should return an empty array if purchaseId is falsy', async () => {
      const logs = await getPurchaseAuditLogs('');
      expect(logs).toEqual([]);
    });

    it('should return audit logs from Supabase when database query succeeds', async () => {
      const mockDbLogs = [
        {
          id: 'audit-log-1',
          entity_id: 'faktur-1',
          action: 'UPDATE_PURCHASE',
          old_data: {},
          new_data: {},
          performed_by: 'user-1',
          performer_name: 'Budi Santoso',
          notes: 'Koreksi nomor faktur dan kuantitas barang',
          created_at: '2026-10-27T10:00:00Z'
        }
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockDbLogs,
        error: null
      });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const logs = await getPurchaseAuditLogs('faktur-1');
      expect(supabase.from).toHaveBeenCalledWith('audit_logs');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('entity_id', 'faktur-1');
      expect(logs).toEqual(mockDbLogs);
    });

    it('should fallback to mock audit logs when Supabase table does not exist or fails', async () => {
      const mockLocalLog = {
        id: 'local-audit-1',
        entity_id: 'faktur-1',
        action: 'UPDATE_PURCHASE',
        old_data: {},
        new_data: {},
        performed_by: 'user-1',
        performer_name: 'Admin Fallback',
        notes: 'Catatan log audit offline',
        created_at: '2026-10-28T09:00:00Z'
      };

      setMockAuditLogs([
        mockLocalLog,
        {
          id: 'local-audit-2',
          entity_id: 'faktur-2',
          action: 'UPDATE_PURCHASE',
          old_data: {},
          new_data: {},
          performed_by: 'user-2',
          performer_name: 'Other',
          notes: 'Faktur lain',
          created_at: '2026-10-28T09:30:00Z'
        }
      ]);

      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '42P01',
          message: 'relation "public.audit_logs" does not exist'
        }
      });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const logs = await getPurchaseAuditLogs('faktur-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe('local-audit-1');
      expect(logs[0].entity_id).toBe('faktur-1');
    });
  });
});
