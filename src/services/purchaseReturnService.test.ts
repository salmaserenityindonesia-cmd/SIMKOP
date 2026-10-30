import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSuppliers,
  getPurchaseReturns,
  getPurchaseReturnDetail,
  createPurchaseReturn,
  completeReturnClaim,
  updatePurchaseReturn,
  generateReturnNumber,
  isValidUUID,
  resetPurchaseReturnMockState,
  setMockSuppliers,
  getMockSuppliers,
  setMockReturnProducts,
  getMockReturnProducts,
  setMockReturns,
  getMockReturns,
  CreatePurchaseReturnPayload,
  Supplier
} from './purchaseReturnService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn()
  }
}));

vi.mock('./auditService', () => ({
  insertAuditLog: vi.fn().mockResolvedValue({ data: [{ id: 'mock-audit-123' }], error: null })
}));

describe('purchaseReturnService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPurchaseReturnMockState();
  });

  describe('Utility: isValidUUID & generateReturnNumber', () => {
    it('should validate UUID format correctly', () => {
      expect(isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
      expect(isValidUUID('invalid-uuid-string')).toBe(false);
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID(null)).toBe(false);
      expect(isValidUUID(undefined)).toBe(false);
    });

    it('should generate standardized return number format RET/YYYYMM/XXXX', () => {
      const returnNumber = generateReturnNumber('2026-10-30');
      expect(returnNumber).toMatch(/^RET\/202610\/\d{4}$/);
    });
  });

  describe('getSuppliers', () => {
    it('should return fallback suppliers list when database is offline or not configured', async () => {
      (supabase.from as any).mockReturnValue(undefined);

      const suppliers = await getSuppliers();
      expect(suppliers.length).toBeGreaterThan(0);
      expect(suppliers[0].name).toContain('Indofood');
    });

    it('should return suppliers from database when available', async () => {
      const dbSuppliers: Supplier[] = [
        { id: 'sup-db-1', name: 'PT Sumber Alfaria', phone: '021-123456', address: 'Tangerang' }
      ];

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: dbSuppliers, error: null })
        })
      });

      const suppliers = await getSuppliers();
      expect(suppliers).toEqual(dbSuppliers);
    });

    it('should fallback if database query returns error with fallback code', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
        })
      });

      const suppliers = await getSuppliers();
      expect(suppliers.length).toBeGreaterThan(0);
      expect(suppliers[0].name).toContain('Indofood');
    });
  });

  describe('createPurchaseReturn - Validation', () => {
    const validPayload: CreatePurchaseReturnPayload = {
      return_number: 'RET/202610/0001',
      return_date: '2026-10-30',
      supplier_id: 'sup-1',
      supplier_name: 'PT Indofood Sukses Makmur',
      original_invoice_number: 'INV-2026-001',
      return_type: 'PIUTANG_PENGGANTIAN',
      items: [
        { product_id: 'prod-1', qty: 2, cost_per_unit: 70000, reason: 'Kemasan rusak' }
      ]
    };

    it('should throw an error if supplier_name is empty', async () => {
      await expect(
        createPurchaseReturn({ ...validPayload, supplier_name: '' })
      ).rejects.toThrow('Nama supplier harus diisi.');
    });

    it('should throw an error if return_date is empty', async () => {
      await expect(
        createPurchaseReturn({ ...validPayload, return_date: '' })
      ).rejects.toThrow('Tanggal retur harus diisi.');
    });

    it('should throw an error if items array is empty or missing', async () => {
      await expect(
        createPurchaseReturn({ ...validPayload, items: [] })
      ).rejects.toThrow('Retur pembelian harus memiliki minimal satu item produk.');
    });

    it('should throw an error if item is missing product_id', async () => {
      await expect(
        createPurchaseReturn({
          ...validPayload,
          items: [{ product_id: '', qty: 1, cost_per_unit: 10000 }]
        })
      ).rejects.toThrow('Setiap item retur harus memiliki ID produk.');
    });

    it('should throw an error if item qty <= 0', async () => {
      await expect(
        createPurchaseReturn({
          ...validPayload,
          items: [{ product_id: 'prod-1', qty: 0, cost_per_unit: 10000 }]
        })
      ).rejects.toThrow('Kuantitas item retur harus lebih besar dari 0.');

      await expect(
        createPurchaseReturn({
          ...validPayload,
          items: [{ product_id: 'prod-1', qty: -5, cost_per_unit: 10000 }]
        })
      ).rejects.toThrow('Kuantitas item retur harus lebih besar dari 0.');
    });

    it('should throw an error if item cost_per_unit is negative', async () => {
      await expect(
        createPurchaseReturn({
          ...validPayload,
          items: [{ product_id: 'prod-1', qty: 2, cost_per_unit: -100 }]
        })
      ).rejects.toThrow('Biaya/harga beli per unit tidak boleh negatif.');
    });
  });

  describe('createPurchaseReturn - Business Logic & Stock Deduction', () => {
    beforeEach(() => {
      (supabase.from as any).mockReturnValue(undefined);
      setMockReturnProducts([
        { id: 'prod-1', name: 'Beras Premium 5kg', sku: 'BRS-01', stock: 10, buy_price: 70000 },
        { id: 'prod-2', name: 'Minyak Goreng 2L', sku: 'MYK-02', stock: 5, buy_price: 30000 }
      ]);
    });

    it('should reject return creation if requested qty exceeds current warehouse stock', async () => {
      const payload: CreatePurchaseReturnPayload = {
        return_date: '2026-10-30',
        supplier_name: 'PT Indofood Sukses Makmur',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [
          { product_id: 'prod-1', qty: 15, cost_per_unit: 70000, reason: 'Cacat produksi' }
        ]
      };

      await expect(createPurchaseReturn(payload)).rejects.toThrow(
        'Stok produk "Beras Premium 5kg" tidak mencukupi untuk diretur. Stok saat ini: 10, kuantitas retur: 15'
      );

      // Pastikan stok tidak berkurang jika validasi gagal
      const products = getMockReturnProducts();
      expect(products.find(p => p.id === 'prod-1')?.stock).toBe(10);
    });

    it('should successfully create return with PIUTANG_PENGGANTIAN and deduct physical stock', async () => {
      const payload: CreatePurchaseReturnPayload = {
        return_date: '2026-10-30',
        supplier_name: 'PT Indofood Sukses Makmur',
        original_invoice_number: 'INV-2026-001',
        return_type: 'PIUTANG_PENGGANTIAN',
        notes: 'Retur 3 karung beras bocor kemasan',
        items: [
          { product_id: 'prod-1', qty: 3, cost_per_unit: 70000, reason: 'Bocor kemasan' }
        ]
      };

      const result = await createPurchaseReturn(payload, 'user-1', 'Admin Budi');

      expect(result.id).toBeDefined();
      expect(result.return_number).toMatch(/^RET\//);
      expect(result.return_type).toBe('PIUTANG_PENGGANTIAN');
      expect(result.claim_status).toBe('MENUNGGU_PENGGANTIAN');
      expect(result.total_amount).toBe(210000);
      expect(result.items?.length).toBe(1);
      expect(result.items?.[0].subtotal).toBe(210000);

      // Verifikasi stok fisik berkurang dari 10 menjadi 7
      const products = getMockReturnProducts();
      expect(products.find(p => p.id === 'prod-1')?.stock).toBe(7);
    });

    it('should set claim_status to HAPUS_BUKU when return_type is BARANG_RUSAK', async () => {
      const payload: CreatePurchaseReturnPayload = {
        return_date: '2026-10-30',
        supplier_name: 'Wings Food',
        return_type: 'BARANG_RUSAK',
        items: [
          { product_id: 'prod-2', qty: 2, cost_per_unit: 30000, reason: 'Barang basi' }
        ]
      };

      const result = await createPurchaseReturn(payload);

      expect(result.return_type).toBe('BARANG_RUSAK');
      expect(result.claim_status).toBe('HAPUS_BUKU');
      expect(result.total_amount).toBe(60000);

      const products = getMockReturnProducts();
      expect(products.find(p => p.id === 'prod-2')?.stock).toBe(3);
    });
  });

  describe('completeReturnClaim - Stock Restock & State Mutation', () => {
    beforeEach(() => {
      (supabase.from as any).mockReturnValue(undefined);
      (supabase.rpc as any).mockReturnValue(undefined);

      setMockReturnProducts([
        { id: 'prod-1', name: 'Beras Premium 5kg', sku: 'BRS-01', stock: 7, buy_price: 70000 },
        { id: 'prod-2', name: 'Minyak Goreng 2L', sku: 'MYK-02', stock: 3, buy_price: 30000 }
      ]);
    });

    it('should throw an error if returnId is empty or whitespace', async () => {
      await expect(completeReturnClaim('')).rejects.toThrow('ID retur pembelian harus disertakan.');
      await expect(completeReturnClaim('   ')).rejects.toThrow('ID retur pembelian harus disertakan.');
    });

    it('should throw an error if return record is not found', async () => {
      await expect(completeReturnClaim('non-existent-id')).rejects.toThrow(
        'Data retur pembelian dengan ID non-existent-id tidak ditemukan.'
      );
    });

    it('should reject claim completion if return_type is not PIUTANG_PENGGANTIAN', async () => {
      // Buat retur bertipe BARANG_RUSAK
      const ret = await createPurchaseReturn({
        return_date: '2026-10-30',
        supplier_name: 'Wings Food',
        return_type: 'BARANG_RUSAK',
        items: [{ product_id: 'prod-2', qty: 1, cost_per_unit: 30000 }]
      });

      await expect(completeReturnClaim(ret.id)).rejects.toThrow(
        'Hanya retur bertipe PIUTANG_PENGGANTIAN yang dapat diselesaikan klaim penggantian barangnya (tipe saat ini: BARANG_RUSAK).'
      );
    });

    it('should successfully complete claim: update claim_status to SELESAI_DIGANTI and restock products', async () => {
      // 1. Buat retur penggantian 3 unit prod-1
      const ret = await createPurchaseReturn({
        return_date: '2026-10-30',
        supplier_name: 'PT Indofood Sukses Makmur',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [{ product_id: 'prod-1', qty: 3, cost_per_unit: 70000 }]
      });

      // Stok awal 7 berkurang 3 menjadi 4 saat retur dibuat
      expect(getMockReturnProducts().find(p => p.id === 'prod-1')?.stock).toBe(4);

      // 2. Selesaikan klaim penggantian (supplier mengirim barang pengganti baru)
      const claimResult = await completeReturnClaim(
        ret.id,
        'user-uuid-1',
        'Barang pengganti telah diterima dalam kondisi prima.'
      );

      expect(claimResult.success).toBe(true);
      expect(claimResult.claim_status).toBe('SELESAI_DIGANTI');
      expect(claimResult.items_restocked).toBe(1);
      expect(claimResult.total_restocked_qty).toBe(3);
      expect(claimResult.completed_at).toBeDefined();

      // 3. Verifikasi stok bertambah kembali (restocked) dari 4 menjadi 7
      expect(getMockReturnProducts().find(p => p.id === 'prod-1')?.stock).toBe(7);

      // 4. Verifikasi detail retur statusnya menjadi SELESAI_DIGANTI dan ada replacement_received_at
      const updatedDetail = await getPurchaseReturnDetail(ret.id);
      expect(updatedDetail?.claim_status).toBe('SELESAI_DIGANTI');
      expect(updatedDetail?.replacement_received_at).toBeDefined();
    });

    it('should enforce idempotency: reject duplicate completion if claim is already SELESAI_DIGANTI', async () => {
      const ret = await createPurchaseReturn({
        return_date: '2026-10-30',
        supplier_name: 'PT Indofood',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [{ product_id: 'prod-1', qty: 2, cost_per_unit: 70000 }]
      });

      // Selesaikan klaim pertama kali
      await completeReturnClaim(ret.id);

      // Upaya penyelesaian kedua kali harus ditolak
      await expect(completeReturnClaim(ret.id)).rejects.toThrow(
        'Status klaim retur bukan MENUNGGU_PENGGANTIAN (status saat ini: SELESAI_DIGANTI). Klaim sudah diproses sebelumnya.'
      );
    });
  });

  describe('completeReturnClaim - RPC Handling & Error Passthrough', () => {
    it('should return RPC result directly when RPC execution succeeds', async () => {
      const mockRpcResult = {
        success: true,
        return_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        claim_status: 'SELESAI_DIGANTI',
        items_restocked: 2,
        total_restocked_qty: 5,
        completed_at: new Date().toISOString()
      };

      (supabase.rpc as any).mockResolvedValue({
        data: mockRpcResult,
        error: null
      });

      const res = await completeReturnClaim(
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        'f47ac10b-58cc-4372-a567-0e02b2c3d480',
        'Diterima RPC'
      );

      expect(res).toEqual(mockRpcResult);
      expect(supabase.rpc).toHaveBeenCalledWith('complete_return_claim', {
        p_return_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        p_user_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
        p_notes: 'Diterima RPC'
      });
    });

    it('should throw business validation error without fallback when RPC raises exception', async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Status klaim retur bukan MENUNGGU_PENGGANTIAN (status saat ini: SELESAI_DIGANTI). Klaim sudah diproses sebelumnya.'
        }
      });

      await expect(
        completeReturnClaim('f47ac10b-58cc-4372-a567-0e02b2c3d479')
      ).rejects.toThrow('Status klaim retur bukan MENUNGGU_PENGGANTIAN');
    });

    it('should fallback gracefully if RPC function is missing (code 42883)', async () => {
      // Sediakan mock data in-memory
      const ret = await createPurchaseReturn({
        return_date: '2026-10-30',
        supplier_name: 'PT Indofood',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [{ product_id: 'prod-1', qty: 1, cost_per_unit: 70000 }]
      });

      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: {
          code: '42883',
          message: 'could not find the function complete_return_claim'
        }
      });

      const result = await completeReturnClaim(ret.id);
      expect(result.success).toBe(true);
      expect(result.claim_status).toBe('SELESAI_DIGANTI');
    });
  });

  describe('getPurchaseReturns & getPurchaseReturnDetail', () => {
    beforeEach(() => {
      (supabase.from as any).mockReturnValue(undefined);
    });

    it('should list returns in reverse chronological order', async () => {
      await createPurchaseReturn({
        return_number: 'RET/202610/0001',
        return_date: '2026-10-25',
        supplier_name: 'Supplier A',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [{ product_id: 'prod-1', qty: 1, cost_per_unit: 70000 }]
      });

      await createPurchaseReturn({
        return_number: 'RET/202610/0002',
        return_date: '2026-10-28',
        supplier_name: 'Supplier B',
        return_type: 'BARANG_RUSAK',
        items: [{ product_id: 'prod-2', qty: 2, cost_per_unit: 30000 }]
      });

      const list = await getPurchaseReturns();
      expect(list.length).toBe(2);
      expect(list[0].return_number).toBe('RET/202610/0002');
      expect(list[1].return_number).toBe('RET/202610/0001');
    });

    it('should return null for getPurchaseReturnDetail when id does not exist', async () => {
      const detail = await getPurchaseReturnDetail('not-found-id');
      expect(detail).toBeNull();
    });

    it('should return full detail with items populated', async () => {
      const ret = await createPurchaseReturn({
        return_number: 'RET/202610/0010',
        return_date: '2026-10-30',
        supplier_name: 'Supplier C',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [{ product_id: 'prod-1', qty: 2, cost_per_unit: 70000, reason: 'Pecah botol' }]
      });

      const detail = await getPurchaseReturnDetail(ret.id);
      expect(detail).not.toBeNull();
      expect(detail?.return_number).toBe('RET/202610/0010');
      expect(detail?.items?.length).toBe(1);
      expect(detail?.items?.[0].product_name).toBe('Beras Premium 5kg');
      expect(detail?.items?.[0].reason).toBe('Pecah botol');
    });
  });

  describe('updatePurchaseReturn', () => {
    beforeEach(() => {
      (supabase.from as any).mockReturnValue(undefined);
    });

    it('should reject update if returnId is empty', async () => {
      await expect(
        updatePurchaseReturn('', { notes: 'Catatan baru' })
      ).rejects.toThrow('ID retur pembelian harus disertakan.');
    });

    it('should reject update if change reason is too short', async () => {
      const ret = await createPurchaseReturn({
        return_date: '2026-10-30',
        supplier_name: 'Supplier A',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [{ product_id: 'prod-1', qty: 1, cost_per_unit: 70000 }]
      });

      await expect(
        updatePurchaseReturn(ret.id, { notes: 'Catatan baru' }, 'user-1', 'pendek')
      ).rejects.toThrow('Alasan perubahan minimal 10 karakter.');
    });

    it('should allow update with exactly 10 characters change reason', async () => {
      const ret = await createPurchaseReturn({
        return_date: '2026-10-30',
        supplier_name: 'Supplier A',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [{ product_id: 'prod-1', qty: 1, cost_per_unit: 70000 }]
      });

      const updated = await updatePurchaseReturn(
        ret.id,
        { notes: 'Updated notes' },
        'user-1',
        '1234567890'
      );
      expect(updated.notes).toBe('Updated notes');
    });

    it('should reject update if claim is already SELESAI_DIGANTI', async () => {
      const ret = await createPurchaseReturn({
        return_date: '2026-10-30',
        supplier_name: 'Supplier A',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [{ product_id: 'prod-1', qty: 1, cost_per_unit: 70000 }]
      });

      await completeReturnClaim(ret.id);

      await expect(
        updatePurchaseReturn(ret.id, { notes: 'Perubahan baru' }, 'user-1', 'Alasan perubahan yang cukup panjang')
      ).rejects.toThrow('Retur pembelian yang klaimnya sudah selesai tidak dapat diubah.');
    });

    it('should successfully update return info when still pending', async () => {
      const ret = await createPurchaseReturn({
        return_date: '2026-10-30',
        supplier_name: 'Supplier A',
        original_invoice_number: 'INV-001',
        return_type: 'PIUTANG_PENGGANTIAN',
        items: [{ product_id: 'prod-1', qty: 1, cost_per_unit: 70000 }]
      });

      const updated = await updatePurchaseReturn(
        ret.id,
        {
          notes: 'Update keterangan retur klaim garansi supplier',
          original_invoice_number: 'INV-001-REV'
        },
        'user-1',
        'Koreksi nomor faktur asli dari distributor'
      );

      expect(updated.notes).toBe('Update keterangan retur klaim garansi supplier');
      expect(updated.original_invoice_number).toBe('INV-001-REV');
    });
  });
});
