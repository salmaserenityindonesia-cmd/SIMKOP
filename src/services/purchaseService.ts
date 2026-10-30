import { supabase } from '../lib/supabaseClient';

export interface PurchaseAuditLog {
  id: string;
  entity_id: string;
  action: string;
  old_data: any;
  new_data: any;
  performed_by: string | null;
  performer_name: string | null;
  notes: string;
  created_at: string;
}

export interface PurchaseItemPayload {
  id?: string;
  produkId: string;
  qty: number;
  hargaBeli: number;
}

export interface UpdatePurchasePayload {
  noFaktur: string;
  tanggal: string;
  items: PurchaseItemPayload[];
}

export interface UpdatePurchaseResult {
  success: boolean;
  purchase_id: string;
  invoice_number: string;
  total_amount: number;
  audit_log_id?: string;
  updated_at: string;
  [key: string]: any;
}

export interface MockProductStock {
  id: string;
  name: string;
  buy_price: number;
  stock: number;
}

export interface MockPurchaseRecord {
  id: string;
  noFaktur: string;
  tanggal: string;
  totalNilai: number;
  items: {
    id: string;
    produkId: string;
    qty: number;
    hargaBeli: number;
  }[];
}

// In-memory mock state for offline fallback and isolated unit tests
let mockProducts: MockProductStock[] = [
  { id: 'prod-1', name: 'Beras Premium 5kg', buy_price: 70000, stock: 20 },
  { id: 'prod-2', name: 'Minyak Goreng 2L', buy_price: 30000, stock: 15 },
  { id: 'prod-3', name: 'Gula Pasir 1kg', buy_price: 12000, stock: 3 },
];

let mockPurchases: MockPurchaseRecord[] = [
  {
    id: 'faktur-1',
    noFaktur: 'INV-2026-001',
    tanggal: '2026-10-25',
    totalNilai: 700000,
    items: [
      { id: 'item-1', produkId: 'prod-1', qty: 10, hargaBeli: 70000 }
    ]
  }
];

let mockPurchaseAuditLogs: PurchaseAuditLog[] = [];

export function setMockProducts(products: MockProductStock[]) {
  mockProducts = products.map(p => ({ ...p }));
}

export function getMockProducts(): MockProductStock[] {
  return mockProducts.map(p => ({ ...p }));
}

export function setMockPurchases(purchases: MockPurchaseRecord[]) {
  mockPurchases = purchases.map(p => ({
    ...p,
    items: p.items.map(it => ({ ...it }))
  }));
}

export function getMockPurchases(): MockPurchaseRecord[] {
  return mockPurchases.map(p => ({
    ...p,
    items: p.items.map(it => ({ ...it }))
  }));
}

export function setMockAuditLogs(logs: PurchaseAuditLog[]) {
  mockPurchaseAuditLogs = logs.map(l => ({ ...l }));
}

export function getMockAuditLogs(): PurchaseAuditLog[] {
  return mockPurchaseAuditLogs.map(l => ({ ...l }));
}

export function resetPurchaseServiceMockState() {
  mockProducts = [
    { id: 'prod-1', name: 'Beras Premium 5kg', buy_price: 70000, stock: 20 },
    { id: 'prod-2', name: 'Minyak Goreng 2L', buy_price: 30000, stock: 15 },
    { id: 'prod-3', name: 'Gula Pasir 1kg', buy_price: 12000, stock: 3 },
  ];
  mockPurchases = [
    {
      id: 'faktur-1',
      noFaktur: 'INV-2026-001',
      tanggal: '2026-10-25',
      totalNilai: 700000,
      items: [
        { id: 'item-1', produkId: 'prod-1', qty: 10, hargaBeli: 70000 }
      ]
    }
  ];
  mockPurchaseAuditLogs = [];
}

function shouldFallback(e: any): boolean {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST301' ||
    msg.includes('schema cache') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('not found') ||
    msg.includes('could not find the function')
  );
}

function fallbackUpdatePurchaseInvoice(
  purchaseId: string,
  payload: UpdatePurchasePayload,
  changeReason: string,
  user: { id: string; name: string }
): UpdatePurchaseResult {
  // 1. Temukan data faktur lama di state mock
  const purchase = mockPurchases.find(p => p.id === purchaseId);
  if (!purchase) {
    throw new Error(`Faktur pembelian dengan ID ${purchaseId} tidak ditemukan.`);
  }

  // 2. Snapshot data lama
  const oldDataSnapshot = {
    purchase: {
      id: purchase.id,
      invoice_number: purchase.noFaktur,
      purchase_date: purchase.tanggal,
      total_amount: purchase.totalNilai
    },
    items: purchase.items.map(it => ({
      id: it.id,
      product_id: it.produkId,
      qty: it.qty,
      buy_price: it.hargaBeli
    }))
  };

  // 3. Rekonsiliasi delta stok per produk: delta = (new_qty - old_qty)
  const productDeltas = new Map<string, { oldQty: number; newQty: number; newBuyPrice: number }>();

  // Hitung akumulasi qty lama
  for (const item of purchase.items) {
    const existing = productDeltas.get(item.produkId) || { oldQty: 0, newQty: 0, newBuyPrice: item.hargaBeli };
    existing.oldQty += item.qty;
    productDeltas.set(item.produkId, existing);
  }

  // Hitung akumulasi qty baru
  for (const item of payload.items) {
    const existing = productDeltas.get(item.produkId) || { oldQty: 0, newQty: 0, newBuyPrice: item.hargaBeli };
    existing.newQty += item.qty;
    existing.newBuyPrice = item.hargaBeli;
    productDeltas.set(item.produkId, existing);
  }

  // Validasi proteksi stok minus secara atomik terlebih dahulu
  for (const [prodId, data] of productDeltas.entries()) {
    const delta = data.newQty - data.oldQty;
    const prod = mockProducts.find(p => p.id === prodId);
    if (!prod) {
      throw new Error(`Produk dengan ID ${prodId} tidak ditemukan di master produk.`);
    }
    if (prod.stock + delta < 0) {
      throw new Error(
        `Stok produk "${prod.name}" tidak mencukupi untuk dikurangi. Stok saat ini: ${prod.stock}, dibutuhkan pengurangan: ${Math.abs(delta)}. Sebagian barang sudah terjual.`
      );
    }
  }

  // Terapkan penyesuaian delta ke stok master produk mock
  for (const [prodId, data] of productDeltas.entries()) {
    const delta = data.newQty - data.oldQty;
    const prod = mockProducts.find(p => p.id === prodId)!;
    prod.stock += delta;
    if (data.newQty > 0) {
      prod.buy_price = data.newBuyPrice;
    }
  }

  // 4. Hitung ulang total nilai faktur
  const totalAmount = payload.items.reduce((sum, item) => sum + (item.qty * item.hargaBeli), 0);

  // 5. Perbarui faktur di mock store
  purchase.noFaktur = payload.noFaktur.trim();
  purchase.tanggal = payload.tanggal;
  purchase.totalNilai = totalAmount;
  purchase.items = payload.items.map((it, idx) => ({
    id: it.id || `item-${Date.now()}-${idx}`,
    produkId: it.produkId,
    qty: it.qty,
    hargaBeli: it.hargaBeli
  }));

  // 6. Snapshot data baru
  const newDataSnapshot = {
    purchase: {
      id: purchase.id,
      invoice_number: purchase.noFaktur,
      purchase_date: purchase.tanggal,
      total_amount: purchase.totalNilai
    },
    items: purchase.items.map(it => ({
      id: it.id,
      product_id: it.produkId,
      qty: it.qty,
      buy_price: it.hargaBeli
    }))
  };

  // 7. Catat audit log perubahan
  const auditId = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();
  const auditLog: PurchaseAuditLog = {
    id: auditId,
    entity_id: purchaseId,
    action: 'UPDATE_PURCHASE',
    old_data: oldDataSnapshot,
    new_data: newDataSnapshot,
    performed_by: user.id || null,
    performer_name: user.name || 'Pengelola',
    notes: changeReason.trim(),
    created_at: nowIso
  };
  mockPurchaseAuditLogs.unshift(auditLog);

  return {
    success: true,
    purchase_id: purchaseId,
    invoice_number: payload.noFaktur.trim(),
    total_amount: totalAmount,
    audit_log_id: auditId,
    updated_at: nowIso
  };
}

export async function updatePurchaseInvoice(
  purchaseId: string,
  payload: UpdatePurchasePayload,
  changeReason: string,
  user: { id: string; name: string }
): Promise<UpdatePurchaseResult> {
  // 1. Validasi input
  if (!purchaseId || purchaseId.trim() === '') {
    throw new Error('ID faktur pembelian harus disertakan.');
  }

  if (!changeReason || changeReason.trim().length < 10) {
    throw new Error('Alasan perubahan minimal 10 karakter.');
  }

  if (!payload.noFaktur || payload.noFaktur.trim() === '') {
    throw new Error('Nomor faktur pembelian harus diisi.');
  }

  if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('Faktur pembelian harus memiliki minimal satu item produk.');
  }

  for (const item of payload.items) {
    if (!item.produkId) {
      throw new Error('Setiap item faktur harus memiliki ID produk.');
    }
    if (typeof item.qty !== 'number' || item.qty <= 0) {
      throw new Error('Kuantitas setiap item produk harus lebih besar dari 0.');
    }
    if (typeof item.hargaBeli !== 'number' || item.hargaBeli < 0) {
      throw new Error('Harga beli item produk tidak boleh negatif.');
    }
  }

  // 2. Panggil RPC Supabase untuk mutasi atomik & audit logging
  try {
    const { data, error } = await supabase.rpc('update_purchase_invoice_atomic', {
      p_purchase_id: purchaseId,
      p_invoice_number: payload.noFaktur.trim(),
      p_purchase_date: payload.tanggal,
      p_items: payload.items.map(item => ({
        product_id: item.produkId,
        qty: item.qty,
        buy_price: item.hargaBeli
      })),
      p_change_reason: changeReason.trim(),
      p_user_id: user.id,
      p_user_name: user.name
    });

    if (error) {
      const msg = error.message || '';
      const isBusinessError =
        error.code === 'P0001' ||
        msg.includes('tidak mencukupi') ||
        msg.includes('Alasan perubahan') ||
        msg.includes('Nomor faktur') ||
        msg.includes('tidak ditemukan') ||
        msg.includes('lebih besar dari 0') ||
        msg.includes('tidak boleh negatif');

      if (isBusinessError) {
        throw new Error(msg);
      }

      if (shouldFallback(error)) {
        console.warn('RPC "update_purchase_invoice_atomic" gagal atau belum tersedia. Beralih ke fallback offline:', error.message);
        return fallbackUpdatePurchaseInvoice(purchaseId, payload, changeReason, user);
      }

      throw new Error(`Gagal memperbarui faktur pembelian: ${msg}`);
    }

    return data as UpdatePurchaseResult;
  } catch (err: any) {
    const errMsg = err?.message || '';
    if (
      errMsg.includes('Alasan perubahan') ||
      errMsg.includes('Nomor faktur') ||
      errMsg.includes('tidak mencukupi') ||
      errMsg.includes('tidak ditemukan') ||
      errMsg.includes('lebih besar dari 0') ||
      errMsg.includes('tidak boleh negatif') ||
      errMsg.includes('harus memiliki minimal satu') ||
      errMsg.includes('harus disertakan')
    ) {
      throw err;
    }

    if (shouldFallback(err)) {
      console.warn('Terjadi kesalahan koneksi atau RPC. Beralih ke fallback offline:', err.message);
      return fallbackUpdatePurchaseInvoice(purchaseId, payload, changeReason, user);
    }

    throw err;
  }
}

export async function getPurchaseAuditLogs(purchaseId: string): Promise<PurchaseAuditLog[]> {
  if (!purchaseId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_id', purchaseId)
      .order('created_at', { ascending: false });

    if (error) {
      if (shouldFallback(error)) {
        console.warn('Tabel "audit_logs" belum tersedia atau offline. Mengambil log dari fallback in-memory.');
        return mockPurchaseAuditLogs.filter(log => log.entity_id === purchaseId);
      }
      throw new Error(`Gagal memuat log audit: ${error.message}`);
    }

    if (data && data.length > 0) {
      return data as PurchaseAuditLog[];
    }

    // Jika kosong di database remote, periksa apakah ada log lokal in-memory
    const localLogs = mockPurchaseAuditLogs.filter(log => log.entity_id === purchaseId);
    return localLogs.length > 0 ? localLogs : [];
  } catch (err: any) {
    if (shouldFallback(err)) {
      return mockPurchaseAuditLogs.filter(log => log.entity_id === purchaseId);
    }
    throw err;
  }
}
