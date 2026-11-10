export interface PosCheckoutItem {
  product_id: string;
  product_name: string;
  quantity: number;
  qty?: number;
  unit_price: number;
  price?: number;
  subtotal: number;
  buy_price?: number;
}

export interface PosCheckoutRpcPayload {
  p_sale_number: string;
  p_member_id: string | null;
  p_cashier_id: string | null;
  p_shift_id: string | null;
  p_subtotal: number;
  p_discount: number;
  p_total_amount: number;
  p_payment_scheme: string;
  p_paid_cash: number;
  p_paid_deposit: number;
  p_paid_credit: number;
  p_items: PosCheckoutItem[];
}

export interface PosCheckoutRpcResponse {
  success: boolean;
  sale_id?: string;
  sale_number?: string;
  message?: string;
}

export interface CheckoutResult {
  success: boolean;
  error?: string;
  saleId?: string;
  saleNumber?: string;
}

