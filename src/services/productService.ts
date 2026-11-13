import { supabase } from '../lib/supabaseClient';

/**
 * Memperbarui stok seluruh produk di tabel public.products menjadi targetStock (default 100)
 * untuk keperluan uji coba katalog, POS kasir, retur pembelian, dan mutasi gudang.
 */
export async function bulkSetAllProductStock(targetStock: number = 100): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({
      stock: targetStock,
      updated_at: new Date().toISOString(),
    })
    .not('id', 'is', null);

  if (error) throw error;
}

/**
 * Memperbarui harga jual produk (sell_price) langsung dari kasir POS
 * serta mencatat perubahan harga tersebut ke tabel public.audit_logs (best-effort).
 */
export async function updateProductSellPriceFromPos(
  productId: string,
  newSellPrice: number,
  oldSellPrice: number,
  userId?: string
): Promise<void> {
  const validPrice = Math.max(0, Math.round(Number(newSellPrice) || 0));

  const { error } = await supabase
    .from('products')
    .update({
      sell_price: validPrice,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId);

  if (error) throw error;

  const validPerformerId =
    userId && userId !== '00000000-0000-0000-0000-000000000000' ? userId : null;

  // Catat jejak perubahan harga ke audit_logs (best-effort)
  try {
    const { error: auditError } = await supabase.from('audit_logs').insert({
      table_name: 'products',
      record_id: productId,
      entity_name: 'products',
      entity_id: productId,
      action: 'UPDATE_SELL_PRICE_POS',
      old_data: { sell_price: oldSellPrice },
      new_data: { sell_price: validPrice },
      performed_by: validPerformerId,
      notes: `Perubahan harga jual langsung dari kasir POS: Rp ${oldSellPrice.toLocaleString('id-ID')} -> Rp ${validPrice.toLocaleString('id-ID')}`,
    });
    if (auditError) {
      console.warn('Audit log update harga POS dilewati:', auditError);
    }
  } catch (auditErr) {
    console.warn('Audit log update harga POS dilewati:', auditErr);
  }
}
