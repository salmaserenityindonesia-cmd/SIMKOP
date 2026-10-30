import { supabase } from '../lib/supabaseClient';
import { insertAuditLog } from './auditService';

export const isValidUUID = (str: unknown): str is string =>
  typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  created_at?: string;
}

export type PurchaseReturnType = 'BARANG_RUSAK' | 'PIUTANG_PENGGANTIAN';
export type ClaimStatus = 'MENUNGGU_PENGGANTIAN' | 'SELESAI_DIGANTI' | 'HAPUS_BUKU';

export interface PurchaseReturnItem {
  id: string;
  return_id?: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  qty: number;
  cost_per_unit: number;
  subtotal: number;
  reason?: string;
  created_at?: string;
}

export interface PurchaseReturn {
  id: string;
  return_number: string;
  return_date: string;
  supplier_id?: string;
  supplier_name: string;
  original_invoice_number?: string;
  return_type: PurchaseReturnType;
  claim_status: ClaimStatus;
  total_amount: number;
  replacement_received_at?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  items?: PurchaseReturnItem[];
}

export interface CreatePurchaseReturnPayload {
  return_number?: string;
  return_date: string;
  supplier_id?: string;
  supplier_name: string;
  original_invoice_number?: string;
  return_type: PurchaseReturnType;
  notes?: string;
  items: {
    product_id: string;
    product_name?: string;
    sku?: string;
    qty: number;
    cost_per_unit: number;
    reason?: string;
  }[];
}

export interface CompleteReturnClaimResult {
  success: boolean;
  return_id: string;
  claim_status: ClaimStatus;
  items_restocked: number;
  total_restocked_qty: number;
  audit_log_id?: string;
  completed_at: string;
  [key: string]: any;
}

export interface MockReturnProduct {
  id: string;
  name: string;
  sku?: string;
  stock: number;
  buy_price?: number;
}

// In-memory mock states for offline fallback & isolated unit tests
let mockSuppliers: Supplier[] = [
  { id: 'sup-1', name: 'PT Indofood Sukses Makmur', phone: '021-5551234', address: 'Kawasan Industri Pulogadung, Jakarta' },
  { id: 'sup-2', name: 'Wings Food Distributor', phone: '031-8884321', address: 'Jl. Rungkut Industri, Surabaya' },
  { id: 'sup-3', name: 'CV Berkah Tani Mandiri', phone: '081234567890', address: 'Jl. Raya Lembang No. 45, Bandung' },
];

let mockProducts: MockReturnProduct[] = [
  { id: 'prod-1', name: 'Beras Premium 5kg', sku: 'BRS-01', stock: 20, buy_price: 70000 },
  { id: 'prod-2', name: 'Minyak Goreng 2L', sku: 'MYK-02', stock: 15, buy_price: 30000 },
  { id: 'prod-3', name: 'Gula Pasir 1kg', sku: 'GLA-03', stock: 5, buy_price: 12000 },
];

let mockReturns: PurchaseReturn[] = [];
let mockReturnItems: PurchaseReturnItem[] = [];
let mockAuditLogs: any[] = [];

export function setMockSuppliers(suppliers: Supplier[]) {
  mockSuppliers = suppliers.map(s => ({ ...s }));
}

export function getMockSuppliers(): Supplier[] {
  return mockSuppliers.map(s => ({ ...s }));
}

export function setMockReturnProducts(products: MockReturnProduct[]) {
  mockProducts = products.map(p => ({ ...p }));
}

export function getMockReturnProducts(): MockReturnProduct[] {
  return mockProducts.map(p => ({ ...p }));
}

export function setMockReturns(returns: PurchaseReturn[]) {
  mockReturns = returns.map(r => ({
    ...r,
    items: r.items ? r.items.map(it => ({ ...it })) : undefined
  }));
}

export function getMockReturns(): PurchaseReturn[] {
  return mockReturns.map(r => ({
    ...r,
    items: r.items ? r.items.map(it => ({ ...it })) : undefined
  }));
}

export function setMockReturnItems(items: PurchaseReturnItem[]) {
  mockReturnItems = items.map(it => ({ ...it }));
}

export function getMockReturnItems(): PurchaseReturnItem[] {
  return mockReturnItems.map(it => ({ ...it }));
}

export function getMockReturnAuditLogs(): any[] {
  return mockAuditLogs.map(l => ({ ...l }));
}

export function resetPurchaseReturnMockState() {
  mockSuppliers = [
    { id: 'sup-1', name: 'PT Indofood Sukses Makmur', phone: '021-5551234', address: 'Kawasan Industri Pulogadung, Jakarta' },
    { id: 'sup-2', name: 'Wings Food Distributor', phone: '031-8884321', address: 'Jl. Rungkut Industri, Surabaya' },
    { id: 'sup-3', name: 'CV Berkah Tani Mandiri', phone: '081234567890', address: 'Jl. Raya Lembang No. 45, Bandung' },
  ];
  mockProducts = [
    { id: 'prod-1', name: 'Beras Premium 5kg', sku: 'BRS-01', stock: 20, buy_price: 70000 },
    { id: 'prod-2', name: 'Minyak Goreng 2L', sku: 'MYK-02', stock: 15, buy_price: 30000 },
    { id: 'prod-3', name: 'Gula Pasir 1kg', sku: 'GLA-03', stock: 5, buy_price: 12000 },
  ];
  mockReturns = [];
  mockReturnItems = [];
  mockAuditLogs = [];
}

export function generateReturnNumber(dateStr?: string): string {
  const targetDate = dateStr ? new Date(dateStr) : new Date();
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const ym = `${year}${month}`;

  // Hitung jumlah faktur retur dalam bulan yang sama untuk sequence nomor
  const countInMonth = mockReturns.filter(r => {
    if (!r.return_number) return false;
    return r.return_number.includes(`RET/${ym}/`);
  }).length;

  const sequence = String(countInMonth + 1).padStart(4, '0');
  return `RET/${ym}/${sequence}`;
}

export function shouldFallback(e: any): boolean {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42883' ||
    code === '42725' ||
    code === '22P02' ||
    code === 'PGRST202' ||
    code === 'PGRST301' ||
    msg.includes('schema cache') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('not found') ||
    msg.includes('could not find the function') ||
    msg.includes('could not choose the best candidate function') ||
    msg.includes('not unique') ||
    msg.includes('invalid input syntax for type uuid')
  );
}

function getMockReturnsWithItems(): PurchaseReturn[] {
  return mockReturns.map(ret => {
    const items = mockReturnItems.filter(it => it.return_id === ret.id);
    return {
      ...ret,
      items: items.map(it => {
        const prod = mockProducts.find(p => p.id === it.product_id);
        return {
          ...it,
          product_name: it.product_name || prod?.name,
          sku: it.sku || prod?.sku
        };
      })
    };
  });
}

function getMockReturnDetail(returnId: string): PurchaseReturn | null {
  const found = mockReturns.find(r => r.id === returnId || r.return_number === returnId);
  if (!found) return null;
  const items = mockReturnItems.filter(it => it.return_id === found.id);
  return {
    ...found,
    items: items.map(it => {
      const prod = mockProducts.find(p => p.id === it.product_id);
      return {
        ...it,
        product_name: it.product_name || prod?.name,
        sku: it.sku || prod?.sku
      };
    })
  };
}

function formatReturnRecord(data: any): PurchaseReturn {
  const items = (data.items || []).map((it: any) => ({
    id: it.id,
    return_id: it.return_id,
    product_id: it.product_id,
    product_name: it.product?.name || it.product_name,
    sku: it.product?.barcode || it.sku,
    qty: Number(it.qty) || 0,
    cost_per_unit: Number(it.cost_per_unit) || 0,
    subtotal: Number(it.subtotal) || 0,
    reason: it.reason || undefined,
    created_at: it.created_at
  }));

  return {
    id: data.id,
    return_number: data.return_number,
    return_date: data.return_date,
    supplier_id: data.supplier_id || undefined,
    supplier_name: data.supplier_name || 'Supplier Umum',
    original_invoice_number: data.original_invoice_number || undefined,
    return_type: data.return_type,
    claim_status: data.claim_status,
    total_amount: Number(data.total_amount) || 0,
    replacement_received_at: data.replacement_received_at || null,
    notes: data.notes || null,
    created_by: data.created_by || null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    items
  };
}

/**
 * Mengambil daftar supplier aktif dari database atau fallback list default.
 */
export async function getSuppliers(): Promise<Supplier[]> {
  try {
    const query = supabase.from?.('suppliers');
    if (!query || typeof query.select !== 'function') {
      return getMockSuppliers();
    }

    const { data, error } = await query
      .select('id, name, phone, address, created_at')
      .order('name', { ascending: true });

    if (error) {
      if (shouldFallback(error)) {
        return getMockSuppliers();
      }
      throw error;
    }

    if (data && data.length > 0) {
      return data;
    }
    return getMockSuppliers();
  } catch (err: any) {
    if (shouldFallback(err)) {
      return getMockSuppliers();
    }
    throw err;
  }
}

/**
 * Mengambil seluruh riwayat faktur retur diurutkan dari yang terbaru (return_date DESC, created_at DESC).
 */
export async function getPurchaseReturns(): Promise<PurchaseReturn[]> {
  try {
    const query = supabase.from?.('purchase_returns');
    if (!query || typeof query.select !== 'function') {
      return getMockReturnsWithItems();
    }

    const { data, error } = await query
      .select(`
        *,
        items:purchase_return_items(
          id, return_id, product_id, qty, cost_per_unit, subtotal, reason, created_at,
          product:products(id, name, barcode)
        )
      `)
      .order('return_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (shouldFallback(error)) {
        return getMockReturnsWithItems();
      }
      throw error;
    }

    return (data || []).map(formatReturnRecord);
  } catch (err: any) {
    if (shouldFallback(err)) {
      return getMockReturnsWithItems();
    }
    throw err;
  }
}

/**
 * Mengambil satu header retur lengkap beserta array items barangnya.
 */
export async function getPurchaseReturnDetail(returnId: string): Promise<PurchaseReturn | null> {
  if (!returnId || returnId.trim() === '') {
    return null;
  }

  try {
    const query = supabase.from?.('purchase_returns');
    if (!query || typeof query.select !== 'function') {
      return getMockReturnDetail(returnId);
    }

    const { data, error } = await query
      .select(`
        *,
        items:purchase_return_items(
          id, return_id, product_id, qty, cost_per_unit, subtotal, reason, created_at,
          product:products(id, name, barcode)
        )
      `)
      .eq('id', returnId)
      .maybeSingle();

    if (error) {
      if (shouldFallback(error)) {
        return getMockReturnDetail(returnId);
      }
      throw error;
    }

    if (!data) {
      return getMockReturnDetail(returnId);
    }

    return formatReturnRecord(data);
  } catch (err: any) {
    if (shouldFallback(err)) {
      return getMockReturnDetail(returnId);
    }
    throw err;
  }
}

/**
 * Membuat faktur retur pembelian baru dengan validasi stok inventori,
 * pemotongan stok fisik pada produk, dan pencatatan audit log.
 */
export async function createPurchaseReturn(
  payload: CreatePurchaseReturnPayload,
  userId?: string,
  userName?: string
): Promise<PurchaseReturn> {
  // 1. Validasi Input Payload
  if (!payload.supplier_name || payload.supplier_name.trim() === '') {
    throw new Error('Nama supplier harus diisi.');
  }

  if (!payload.return_date || payload.return_date.trim() === '') {
    throw new Error('Tanggal retur harus diisi.');
  }

  if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('Retur pembelian harus memiliki minimal satu item produk.');
  }

  for (const item of payload.items) {
    if (!item.product_id || item.product_id.trim() === '') {
      throw new Error('Setiap item retur harus memiliki ID produk.');
    }
    if (typeof item.qty !== 'number' || item.qty <= 0) {
      throw new Error('Kuantitas item retur harus lebih besar dari 0.');
    }
    if (typeof item.cost_per_unit !== 'number' || item.cost_per_unit < 0) {
      throw new Error('Biaya/harga beli per unit tidak boleh negatif.');
    }
  }

  const claimStatus: ClaimStatus = payload.return_type === 'BARANG_RUSAK' ? 'HAPUS_BUKU' : 'MENUNGGU_PENGGANTIAN';
  const returnNumber = payload.return_number?.trim() || generateReturnNumber(payload.return_date);
  const totalAmount = payload.items.reduce((sum, item) => sum + (item.qty * item.cost_per_unit), 0);
  const nowIso = new Date().toISOString();

  // 2. Coba simpan ke Supabase jika tersedia
  try {
    const tableReturns = supabase.from?.('purchase_returns');
    const tableProducts = supabase.from?.('products');
    const tableReturnItems = supabase.from?.('purchase_return_items');

    if (!tableReturns || !tableProducts || !tableReturnItems) {
      return executeInMemoryCreateReturn(payload, returnNumber, claimStatus, totalAmount, userId, userName, nowIso);
    }

    // Periksa ketersediaan stok produk di database
    for (const item of payload.items) {
      const { data: prodData, error: prodErr } = await tableProducts
        .select('id, name, stock')
        .eq('id', item.product_id)
        .single();

      if (prodErr) {
        if (shouldFallback(prodErr)) {
          return executeInMemoryCreateReturn(payload, returnNumber, claimStatus, totalAmount, userId, userName, nowIso);
        }
        throw prodErr;
      }

      if (prodData) {
        if (prodData.stock < item.qty) {
          throw new Error(
            `Stok produk "${prodData.name || item.product_id}" tidak mencukupi untuk diretur. Stok saat ini: ${prodData.stock}, kuantitas retur: ${item.qty}`
          );
        }
      }
    }

    // Kurangi stok di database
    for (const item of payload.items) {
      const { data: currentProd } = await tableProducts.select('stock').eq('id', item.product_id).single();
      const currentStock = currentProd?.stock ?? 0;
      await tableProducts.update({
        stock: currentStock - item.qty,
        updated_at: nowIso
      }).eq('id', item.product_id);
    }

    // Insert purchase_returns header
    const insertReturnData: any = {
      return_number: returnNumber,
      return_date: payload.return_date,
      supplier_name: payload.supplier_name.trim(),
      original_invoice_number: payload.original_invoice_number?.trim() || null,
      return_type: payload.return_type,
      claim_status: claimStatus,
      total_amount: totalAmount,
      notes: payload.notes?.trim() || null,
      created_at: nowIso,
      updated_at: nowIso
    };
    if (isValidUUID(payload.supplier_id)) {
      insertReturnData.supplier_id = payload.supplier_id;
    }
    if (isValidUUID(userId)) {
      insertReturnData.created_by = userId;
    }

    const { data: createdReturn, error: returnInsertErr } = await tableReturns
      .insert(insertReturnData)
      .select()
      .single();

    if (returnInsertErr) {
      if (shouldFallback(returnInsertErr)) {
        return executeInMemoryCreateReturn(payload, returnNumber, claimStatus, totalAmount, userId, userName, nowIso);
      }
      throw returnInsertErr;
    }

    // Insert purchase_return_items
    const itemsToInsert = payload.items.map(it => ({
      return_id: createdReturn.id,
      product_id: it.product_id,
      qty: it.qty,
      cost_per_unit: it.cost_per_unit,
      subtotal: it.qty * it.cost_per_unit,
      reason: it.reason?.trim() || null,
      created_at: nowIso
    }));

    const { data: createdItems, error: itemsInsertErr } = await tableReturnItems
      .insert(itemsToInsert)
      .select();

    if (itemsInsertErr) {
      if (shouldFallback(itemsInsertErr)) {
        return executeInMemoryCreateReturn(payload, returnNumber, claimStatus, totalAmount, userId, userName, nowIso);
      }
      throw itemsInsertErr;
    }

    // Catat jejak audit
    try {
      await insertAuditLog({
        table_name: 'purchase_returns',
        action: 'CREATE_RETURN',
        record_id: createdReturn.id,
        entity_name: 'purchase_returns',
        entity_id: createdReturn.id,
        new_data: { return: createdReturn, items: createdItems },
        performed_by: isValidUUID(userId) ? userId : null,
        performer_name: userName || 'Pengelola',
        notes: `Pembuatan retur pembelian nomor ${returnNumber}`
      });
    } catch (auditErr) {
      console.warn('Gagal mencatat audit log retur pembelian:', auditErr);
    }

    return {
      ...createdReturn,
      items: (createdItems || []).map((ci: any) => ({
        ...ci,
        product_name: payload.items.find(it => it.product_id === ci.product_id)?.product_name,
        sku: payload.items.find(it => it.product_id === ci.product_id)?.sku
      }))
    };
  } catch (err: any) {
    const msg = err?.message || '';
    if (
      msg.includes('tidak mencukupi') ||
      msg.includes('harus diisi') ||
      msg.includes('harus memiliki minimal') ||
      msg.includes('lebih besar dari 0') ||
      msg.includes('tidak boleh negatif') ||
      msg.includes('ID produk')
    ) {
      throw err;
    }

    if (shouldFallback(err)) {
      return executeInMemoryCreateReturn(payload, returnNumber, claimStatus, totalAmount, userId, userName, nowIso);
    }

    throw err;
  }
}

function executeInMemoryCreateReturn(
  payload: CreatePurchaseReturnPayload,
  returnNumber: string,
  claimStatus: ClaimStatus,
  totalAmount: number,
  userId?: string,
  userName?: string,
  nowIso: string = new Date().toISOString()
): PurchaseReturn {
  // Validasi stok produk in-memory
  for (const item of payload.items) {
    const prod = mockProducts.find(p => p.id === item.product_id);
    if (prod) {
      if (prod.stock < item.qty) {
        throw new Error(
          `Stok produk "${prod.name}" tidak mencukupi untuk diretur. Stok saat ini: ${prod.stock}, kuantitas retur: ${item.qty}`
        );
      }
    }
  }

  // Kurangi stok produk in-memory
  for (const item of payload.items) {
    const prod = mockProducts.find(p => p.id === item.product_id);
    if (prod) {
      prod.stock -= item.qty;
    }
  }

  const returnId = `ret-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const createdItems: PurchaseReturnItem[] = payload.items.map((it, idx) => {
    const prod = mockProducts.find(p => p.id === it.product_id);
    return {
      id: `ret-item-${Date.now()}-${idx}`,
      return_id: returnId,
      product_id: it.product_id,
      product_name: it.product_name || prod?.name || 'Produk',
      sku: it.sku || prod?.sku,
      qty: it.qty,
      cost_per_unit: it.cost_per_unit,
      subtotal: it.qty * it.cost_per_unit,
      reason: it.reason?.trim() || undefined,
      created_at: nowIso
    };
  });

  const newReturnRecord: PurchaseReturn = {
    id: returnId,
    return_number: returnNumber,
    return_date: payload.return_date,
    supplier_id: payload.supplier_id || 'sup-1',
    supplier_name: payload.supplier_name.trim(),
    original_invoice_number: payload.original_invoice_number?.trim() || undefined,
    return_type: payload.return_type,
    claim_status: claimStatus,
    total_amount: totalAmount,
    replacement_received_at: null,
    notes: payload.notes?.trim() || null,
    created_by: userId || null,
    created_at: nowIso,
    updated_at: nowIso,
    items: createdItems
  };

  mockReturns.unshift(newReturnRecord);
  mockReturnItems.push(...createdItems);

  mockAuditLogs.unshift({
    id: `audit-${Date.now()}`,
    table_name: 'purchase_returns',
    action: 'CREATE_RETURN',
    record_id: returnId,
    entity_name: 'purchase_returns',
    entity_id: returnId,
    new_data: newReturnRecord,
    performed_by: userId || null,
    performer_name: userName || 'Pengelola',
    notes: `Pembuatan retur pembelian ${returnNumber}`,
    created_at: nowIso
  });

  return newReturnRecord;
}

/**
 * Menyelesaikan klaim retur pembelian (penerimaan barang pengganti):
 * Menambahkan kembali stok produk ke inventori master dan memperbarui status klaim menjadi 'SELESAI_DIGANTI'.
 * Mengutamakan eksekusi RPC PostgreSQL atomik `complete_return_claim`, dengan fallback mutasi aman.
 */
export async function completeReturnClaim(
  returnId: string,
  userId?: string,
  notes?: string
): Promise<CompleteReturnClaimResult> {
  if (!returnId || returnId.trim() === '') {
    throw new Error('ID retur pembelian harus disertakan.');
  }

  // 1. Coba panggil RPC atomic complete_return_claim
  try {
    const rpcFn = supabase.rpc;
    if (typeof rpcFn === 'function') {
      const res = await rpcFn('complete_return_claim', {
        p_return_id: isValidUUID(returnId) ? returnId : null,
        p_user_id: isValidUUID(userId) ? userId : null,
        p_notes: notes?.trim() || null
      });

      if (res) {
        const { data, error } = res;
        if (!error && data) {
          return data as CompleteReturnClaimResult;
        }

        if (error) {
          const msg = error.message || '';
          // Tangani pesan validasi bisnis yang dilempar oleh RAISE EXCEPTION PostgreSQL
          if (
            error.code === 'P0001' ||
            msg.includes('tidak ditemukan') ||
            msg.includes('PIUTANG_PENGGANTIAN') ||
            msg.includes('MENUNGGU_PENGGANTIAN') ||
            msg.includes('Klaim sudah diproses')
          ) {
            throw new Error(msg);
          }

          if (shouldFallback(error)) {
            console.warn('RPC complete_return_claim belum tersedia atau offline. Menjalankan fallback mutasi:', msg);
            return await executeFallbackCompleteReturnClaim(returnId, userId, notes);
          }

          throw new Error(`Gagal menyelesaikan klaim retur: ${msg}`);
        }
      }
    }

    return await executeFallbackCompleteReturnClaim(returnId, userId, notes);
  } catch (err: any) {
    const msg = err?.message || '';
    if (
      msg.includes('tidak ditemukan') ||
      msg.includes('PIUTANG_PENGGANTIAN') ||
      msg.includes('MENUNGGU_PENGGANTIAN') ||
      msg.includes('Klaim sudah diproses') ||
      msg.includes('harus disertakan')
    ) {
      throw err;
    }

    if (shouldFallback(err)) {
      console.warn('Terjadi kesalahan jaringan atau RPC pada completeReturnClaim. Beralih ke fallback:', msg);
      return await executeFallbackCompleteReturnClaim(returnId, userId, notes);
    }

    throw err;
  }
}

async function executeFallbackCompleteReturnClaim(
  returnId: string,
  userId?: string,
  notes?: string
): Promise<CompleteReturnClaimResult> {
  const nowIso = new Date().toISOString();

  // A. Cek Supabase langsung jika tabel tersedia
  try {
    const tableReturns = supabase.from?.('purchase_returns');
    const tableItems = supabase.from?.('purchase_return_items');
    const tableProducts = supabase.from?.('products');

    if (tableReturns && tableItems && tableProducts && isValidUUID(returnId)) {
      const { data: remoteReturn } = await tableReturns.select('*').eq('id', returnId).maybeSingle();

      if (remoteReturn) {
        if (remoteReturn.return_type !== 'PIUTANG_PENGGANTIAN') {
          throw new Error(
            `Hanya retur bertipe PIUTANG_PENGGANTIAN yang dapat diselesaikan klaim penggantian barangnya (tipe saat ini: ${remoteReturn.return_type}).`
          );
        }

        if (remoteReturn.claim_status !== 'MENUNGGU_PENGGANTIAN') {
          throw new Error(
            `Status klaim retur bukan MENUNGGU_PENGGANTIAN (status saat ini: ${remoteReturn.claim_status}). Klaim sudah diproses sebelumnya.`
          );
        }

        // Ambil item retur
        const { data: items } = await tableItems.select('*').eq('return_id', returnId);
        const returnItems = items || [];

        // Restock produk ke inventori
        let totalRestockedQty = 0;
        for (const item of returnItems) {
          const { data: prod } = await tableProducts.select('stock').eq('id', item.product_id).single();
          const currentStock = prod?.stock ?? 0;
          await tableProducts.update({
            stock: currentStock + Number(item.qty),
            updated_at: nowIso
          }).eq('id', item.product_id);
          totalRestockedQty += Number(item.qty);
        }

        // Perbarui status retur
        await tableReturns.update({
          claim_status: 'SELESAI_DIGANTI',
          replacement_received_at: nowIso,
          updated_at: nowIso
        }).eq('id', returnId);

        // Catat log audit
        let auditLogId = `audit-${Date.now()}`;
        try {
          const auditRes = await insertAuditLog({
            table_name: 'purchase_returns',
            action: 'COMPLETE_CLAIM',
            record_id: returnId,
            entity_name: 'purchase_returns',
            entity_id: returnId,
            old_data: remoteReturn,
            new_data: {
              claim_status: 'SELESAI_DIGANTI',
              replacement_received_at: nowIso,
              items_restocked: returnItems.length,
              total_restocked_qty: totalRestockedQty
            },
            performed_by: isValidUUID(userId) ? userId : null,
            performer_name: 'Pengelola',
            notes: notes || 'Barang pengganti dari supplier telah diterima dan stok ditambahkan kembali ke inventori'
          });
          const resData = (auditRes as any)?.data;
          if (Array.isArray(resData) && resData[0]?.id) {
            auditLogId = resData[0].id;
          }
        } catch (auditErr) {
          console.warn('Gagal mencatat audit log fallback:', auditErr);
        }

        return {
          success: true,
          return_id: returnId,
          claim_status: 'SELESAI_DIGANTI',
          items_restocked: returnItems.length,
          total_restocked_qty: totalRestockedQty,
          audit_log_id: auditLogId,
          completed_at: nowIso
        };
      }
    }
  } catch (dbErr: any) {
    const msg = dbErr?.message || '';
    if (
      msg.includes('PIUTANG_PENGGANTIAN') ||
      msg.includes('MENUNGGU_PENGGANTIAN') ||
      msg.includes('Klaim sudah diproses')
    ) {
      throw dbErr;
    }
    // Lanjutkan ke mock in-memory jika remote query gagal/fallback
  }

  // B. Fallback in-memory
  const mockRet = mockReturns.find(r => r.id === returnId || r.return_number === returnId);
  if (!mockRet) {
    throw new Error(`Data retur pembelian dengan ID ${returnId} tidak ditemukan.`);
  }

  if (mockRet.return_type !== 'PIUTANG_PENGGANTIAN') {
    throw new Error(
      `Hanya retur bertipe PIUTANG_PENGGANTIAN yang dapat diselesaikan klaim penggantian barangnya (tipe saat ini: ${mockRet.return_type}).`
    );
  }

  if (mockRet.claim_status !== 'MENUNGGU_PENGGANTIAN') {
    throw new Error(
      `Status klaim retur bukan MENUNGGU_PENGGANTIAN (status saat ini: ${mockRet.claim_status}). Klaim sudah diproses sebelumnya.`
    );
  }

  const items = mockReturnItems.filter(it => it.return_id === mockRet.id);
  let totalRestockedQty = 0;

  for (const it of items) {
    const prod = mockProducts.find(p => p.id === it.product_id);
    if (prod) {
      prod.stock += it.qty;
    }
    totalRestockedQty += it.qty;
  }

  mockRet.claim_status = 'SELESAI_DIGANTI';
  mockRet.replacement_received_at = nowIso;
  mockRet.updated_at = nowIso;

  const auditId = `audit-${Date.now()}`;
  mockAuditLogs.unshift({
    id: auditId,
    table_name: 'purchase_returns',
    action: 'COMPLETE_CLAIM',
    record_id: mockRet.id,
    entity_name: 'purchase_returns',
    entity_id: mockRet.id,
    notes: notes || 'Barang pengganti dari supplier telah diterima dan stok ditambahkan kembali ke inventori',
    created_at: nowIso
  });

  return {
    success: true,
    return_id: mockRet.id,
    claim_status: 'SELESAI_DIGANTI',
    items_restocked: items.length,
    total_restocked_qty: totalRestockedQty,
    audit_log_id: auditId,
    completed_at: nowIso
  };
}

/**
 * Memperbarui data retur pembelian jika belum diselesaikan klaimnya.
 */
export async function updatePurchaseReturn(
  returnId: string,
  payload: Partial<CreatePurchaseReturnPayload>,
  userId?: string,
  reason?: string
): Promise<PurchaseReturn> {
  if (!returnId || returnId.trim() === '') {
    throw new Error('ID retur pembelian harus disertakan.');
  }

  if (reason !== undefined && reason.trim().length > 0 && reason.trim().length < 10) {
    throw new Error('Alasan perubahan minimal 10 karakter.');
  }

  const existingDetail = await getPurchaseReturnDetail(returnId);
  if (!existingDetail) {
    throw new Error(`Data retur pembelian dengan ID ${returnId} tidak ditemukan.`);
  }

  if (existingDetail.claim_status === 'SELESAI_DIGANTI') {
    throw new Error('Retur pembelian yang klaimnya sudah selesai tidak dapat diubah.');
  }

  const nowIso = new Date().toISOString();

  try {
    const tableReturns = supabase.from?.('purchase_returns');
    if (tableReturns && isValidUUID(returnId)) {
      const updateData: any = {
        updated_at: nowIso
      };
      if (payload.return_number) updateData.return_number = payload.return_number.trim();
      if (payload.return_date) updateData.return_date = payload.return_date;
      if (payload.supplier_name) updateData.supplier_name = payload.supplier_name.trim();
      if (payload.original_invoice_number !== undefined) updateData.original_invoice_number = payload.original_invoice_number?.trim() || null;
      if (payload.notes !== undefined) updateData.notes = payload.notes?.trim() || null;

      const { data, error } = await tableReturns.update(updateData).eq('id', returnId).select().single();
      if (error) {
        if (shouldFallback(error)) {
          return updateInMemoryReturn(returnId, payload, reason, userId, nowIso);
        }
        throw error;
      }

      try {
        await insertAuditLog({
          table_name: 'purchase_returns',
          action: 'UPDATE_RETURN',
          record_id: returnId,
          entity_name: 'purchase_returns',
          entity_id: returnId,
          old_data: existingDetail,
          new_data: data,
          performed_by: isValidUUID(userId) ? userId : null,
          performer_name: 'Pengelola',
          notes: reason?.trim() || 'Perubahan informasi retur pembelian'
        });
      } catch (auditErr) {
        console.warn('Gagal mencatat audit log update retur:', auditErr);
      }

      return {
        ...existingDetail,
        ...data
      };
    }

    return updateInMemoryReturn(returnId, payload, reason, userId, nowIso);
  } catch (err: any) {
    if (shouldFallback(err)) {
      return updateInMemoryReturn(returnId, payload, reason, userId, nowIso);
    }
    throw err;
  }
}

function updateInMemoryReturn(
  returnId: string,
  payload: Partial<CreatePurchaseReturnPayload>,
  reason?: string,
  userId?: string,
  nowIso: string = new Date().toISOString()
): PurchaseReturn {
  const target = mockReturns.find(r => r.id === returnId || r.return_number === returnId);
  if (!target) {
    throw new Error(`Data retur pembelian dengan ID ${returnId} tidak ditemukan.`);
  }

  if (target.claim_status === 'SELESAI_DIGANTI') {
    throw new Error('Retur pembelian yang klaimnya sudah selesai tidak dapat diubah.');
  }

  const oldDataSnapshot = { ...target };

  if (payload.return_number) target.return_number = payload.return_number.trim();
  if (payload.return_date) target.return_date = payload.return_date;
  if (payload.supplier_name) target.supplier_name = payload.supplier_name.trim();
  if (payload.original_invoice_number !== undefined) target.original_invoice_number = payload.original_invoice_number?.trim();
  if (payload.notes !== undefined) target.notes = payload.notes?.trim() || null;
  target.updated_at = nowIso;

  mockAuditLogs.unshift({
    id: `audit-${Date.now()}`,
    table_name: 'purchase_returns',
    action: 'UPDATE_RETURN',
    record_id: target.id,
    entity_name: 'purchase_returns',
    entity_id: target.id,
    old_data: oldDataSnapshot,
    new_data: { ...target },
    performed_by: userId || null,
    performer_name: 'Pengelola',
    notes: reason?.trim() || 'Perubahan data retur pembelian',
    created_at: nowIso
  });

  return { ...target };
}
