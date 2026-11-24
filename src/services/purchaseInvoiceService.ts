// File: src/services/purchaseInvoiceService.ts
// Domain service untuk pengelolaan Faktur Pembelian (Restock) dan Riwayat Pergerakan Stok Barang Masuk

import { supabase } from '../lib/supabaseClient';
import { CreatePurchaseInvoiceRpcResponse } from '../types/purchase';
import {
  formatCompactRegister,
  getCompactPeriodPrefix,
  getNextCompactRegister,
  resolveValidDate,
} from '../utils/receiptGenerator';

function shouldFallback(e: any): boolean {
  if (!e) return false;
  const msg = String(e.message || "").toLowerCase();
  return e.code === "42P01" || msg.includes("schema cache") || msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch");
}

function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeInvoiceDate(invoiceDate?: string): string {
  const trimmed = (invoiceDate || '').trim();
  if (!trimmed) {
    return getLocalDateString();
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  return trimmed;
}

export function formatPurchaseInvoiceNumber(invoiceDate: string, seq: number): string {
  const normalizedDate = normalizeInvoiceDate(invoiceDate);
  const targetDate = resolveValidDate(normalizedDate);
  return formatCompactRegister('PB', seq, targetDate);
}

function extractMaxSequenceForPrefix(
  invoiceNumbers: Array<string | null | undefined>,
  prefix: string
): number {
  const upperPrefix = prefix.toUpperCase();
  let maxSeq = 0;

  for (const raw of invoiceNumbers) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed.toUpperCase().startsWith(upperPrefix)) continue;

    const suffix = trimmed.slice(prefix.length);
    if (/^\d+$/.test(suffix)) {
      const seq = parseInt(suffix, 10);
      if (!Number.isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  return maxSeq;
}

export interface RestockItem {
  id?: string;
  produkId: string;
  qty: number;
  hargaBeli: number;
}

export interface FakturPembelian {
  id: string;
  noFaktur: string;
  tanggal: string;
  totalNilai: number;
  items: RestockItem[];
}

export interface RiwayatStok {
  id: string;
  tanggal: string;
  tipe: 'in' | 'out';
  qty: number;
  keterangan: string;
}

// In-memory fallback state untuk lingkungan offline / pengujian tanpa Supabase DB
let mockFakturList: FakturPembelian[] = [];

export function getMockFakturList(): FakturPembelian[] {
  return mockFakturList;
}

export function setMockFakturList(list: FakturPembelian[]): void {
  mockFakturList = list;
}

export async function getFakturPembelian(): Promise<FakturPembelian[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select(`
      id,
      invoice_number,
      purchase_date,
      total_amount,
      purchase_items (
        id,
        product_id,
        qty,
        buy_price
      )
    `)
    .order('purchase_date', { ascending: false });

  if (error) {
    if (shouldFallback(error)) {
      return [...mockFakturList].sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
    }
    throw new Error(`Gagal memuat faktur pembelian: ${error.message}`);
  }

  // Format ke struktur FakturPembelian
  const result: FakturPembelian[] = (data || []).map((p: any) => ({
    id: p.id,
    noFaktur: p.invoice_number,
    tanggal: p.purchase_date,
    totalNilai: Number(p.total_amount || 0),
    items: (p.purchase_items || []).map((pi: any) => ({
      id: pi.id,
      produkId: pi.product_id,
      qty: pi.qty,
      hargaBeli: Number(pi.buy_price || 0)
    }))
  }));

  return result;
}

export async function catatRestockFaktur(faktur: Omit<FakturPembelian, 'id' | 'totalNilai'>): Promise<FakturPembelian> {
  if (!faktur.noFaktur || faktur.noFaktur.trim() === '') {
    throw new Error('Nomor Faktur (noFaktur) harus diisi');
  }

  if (!faktur.items || !Array.isArray(faktur.items) || faktur.items.length === 0) {
    throw new Error('Faktur pembelian harus memiliki minimal satu item produk.');
  }

  const totalNilai = faktur.items.reduce((sum, item) => sum + (item.qty * item.hargaBeli), 0);
  const purchaseDate = faktur.tanggal || new Date().toISOString().split('T')[0];

  // 1. Eksekusi Atomic RPC create_purchase_invoice_atomic
  if (supabase.rpc && typeof supabase.rpc === 'function') {
    try {
      const rpcPayload = {
        p_invoice_number: faktur.noFaktur.trim(),
        p_purchase_date: purchaseDate,
        p_items: faktur.items.map(item => ({
          product_id: item.produkId,
          qty: item.qty,
          buy_price: item.hargaBeli
        }))
      };

      const rpcRes = (await supabase.rpc('create_purchase_invoice_atomic', rpcPayload as any)) as any;

      if (rpcRes) {
        const { data, error } = rpcRes;
        if (error) {
          const isMissingFunction = error.code === 'PGRST202' || error.message?.includes('Could not find the function') || error.code === '42883';
          if (!isMissingFunction) {
            throw new Error(error.message || 'Gagal menyimpan faktur restock');
          }
        } else if (data) {
          const responseData = data as CreatePurchaseInvoiceRpcResponse;
          if (responseData.success === false) {
            throw new Error(responseData.message || 'Penyimpanan faktur restock ditolak');
          }
          return {
            ...faktur,
            id: responseData.id || `faktur-${Date.now()}`,
            totalNilai: Number(responseData.totalNilai || responseData.total_amount || totalNilai)
          };
        }
      }
    } catch (err: any) {
      if (!err.message?.includes('Could not find the function') && err.code !== 'PGRST202' && err.code !== '42883') {
        throw err;
      }
    }
  }

  // 2. Fallback: sequential client-side mutations (for environments without create_purchase_invoice_atomic RPC)
  const { data: purchaseData, error: purchaseError } = await supabase
    .from('purchases')
    .insert([{
      invoice_number: faktur.noFaktur,
      purchase_date: faktur.tanggal,
      total_amount: totalNilai
    }])
    .select()
    .single();

  if (purchaseError) {
    if (shouldFallback(purchaseError)) {
      const newFaktur: FakturPembelian = {
        ...faktur,
        id: `faktur-${Date.now()}`,
        totalNilai
      };
      mockFakturList.push(newFaktur);
      return newFaktur;
    }
    throw new Error(`Gagal menyimpan faktur: ${purchaseError.message}`);
  }

  // 3. Insert ke purchase_items
  const itemsToInsert = faktur.items.map(item => ({
    purchase_id: purchaseData.id,
    product_id: item.produkId,
    qty: item.qty,
    buy_price: item.hargaBeli
  }));

  const { error: itemsError } = await supabase.from('purchase_items').insert(itemsToInsert);
  if (itemsError) {
    console.error('Failed to insert items:', itemsError.message);
    throw new Error(`Faktur tersimpan, tetapi gagal menyimpan item: ${itemsError.message}`);
  }

  // 4. Update stock in products table
  for (const item of faktur.items) {
    const { data: prodData } = await supabase.from('products').select('stock').eq('id', item.produkId).single();
    if (prodData) {
      await supabase.from('products')
        .update({ stock: prodData.stock + item.qty, buy_price: item.hargaBeli })
        .eq('id', item.produkId);
    }
  }

  return {
    ...faktur,
    id: purchaseData.id,
    totalNilai
  };
}

export async function getRiwayatStok(produkId: string): Promise<RiwayatStok[]> {
  const riwayat: RiwayatStok[] = [];

  const { data: purchaseItems, error: pError } = await supabase
    .from('purchase_items')
    .select(`
      qty,
      purchases (
        id,
        invoice_number,
        purchase_date
      )
    `)
    .eq('product_id', produkId);

  if (!pError && purchaseItems) {
    purchaseItems.forEach((item: any) => {
      riwayat.push({
        id: `riwayat-${item.purchases?.id}-${Date.now()}`,
        tanggal: item.purchases?.purchase_date || new Date().toISOString(),
        tipe: 'in',
        qty: item.qty,
        keterangan: `Restock (Faktur: ${item.purchases?.invoice_number || 'Unknown'})`
      });
    });
  } else {
    // Fallback to mock
    mockFakturList.forEach(faktur => {
      const item = faktur.items.find(i => i.produkId === produkId);
      if (item) {
        riwayat.push({
          id: `riwayat-${faktur.id}`,
          tanggal: faktur.tanggal,
          tipe: 'in',
          qty: item.qty,
          keterangan: `Restock (Faktur: ${faktur.noFaktur})`
        });
      }
    });
  }

  return riwayat;
}

export async function generateNextPurchaseInvoiceNumber(invoiceDate: string): Promise<string> {
  const normalizedDate = normalizeInvoiceDate(invoiceDate);
  const targetDate = resolveValidDate(normalizedDate);
  const prefix = getCompactPeriodPrefix('PB', targetDate);

  try {
    const { data, error } = await supabase
      .from('purchases')
      .select('invoice_number')
      .ilike('invoice_number', `${prefix}%`);

    if (error) {
      if (shouldFallback(error)) {
        return getNextCompactRegister(
          'PB',
          mockFakturList.map((f) => f.noFaktur),
          targetDate
        );
      }
      throw new Error(`Gagal membuat nomor faktur otomatis: ${error.message}`);
    }

    return getNextCompactRegister(
      'PB',
      (data || []).map((row: any) => row?.invoice_number),
      targetDate
    );
  } catch (err: any) {
    if (shouldFallback(err)) {
      return getNextCompactRegister(
        'PB',
        mockFakturList.map((f) => f.noFaktur),
        targetDate
      );
    }
    throw err;
  }
}

export async function isPurchaseInvoiceNumberExists(invoiceNumber: string): Promise<boolean> {
  const trimmed = invoiceNumber.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('purchases')
      .select('id')
      .eq('invoice_number', trimmed)
      .limit(1);

    if (error) {
      if (shouldFallback(error)) {
        return mockFakturList.some(
          (f) => f.noFaktur.trim().toLowerCase() === trimmed.toLowerCase()
        );
      }
      throw new Error(`Gagal memeriksa duplikasi nomor faktur: ${error.message}`);
    }

    return Array.isArray(data) && data.length > 0;
  } catch (err: any) {
    if (shouldFallback(err)) {
      return mockFakturList.some(
        (f) => f.noFaktur.trim().toLowerCase() === trimmed.toLowerCase()
      );
    }
    throw err;
  }
}

