// File: src/types/purchase.ts
// Kontrak tipe data untuk RPC Transaksi Atomic Faktur Pembelian (Restock)

export interface PurchaseInvoiceItemRpc {
  product_id: string;
  qty: number;
  buy_price: number;
}

export interface CreatePurchaseInvoiceRpcPayload {
  p_invoice_number: string;
  p_purchase_date: string;
  p_items: PurchaseInvoiceItemRpc[];
  p_user_id?: string | null;
  p_user_name?: string | null;
}

export interface CreatePurchaseInvoiceRpcResponse {
  success: boolean;
  id?: string;
  noFaktur?: string;
  invoice_number?: string;
  tanggal?: string;
  purchase_date?: string;
  totalNilai?: number;
  total_amount?: number;
  message?: string;
}

