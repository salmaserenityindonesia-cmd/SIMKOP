import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import { getProduk } from './koperasiService';

/**
 * 1. Generate and download template for Products
 */
export async function exportProductTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Template Produk');

  sheet.columns = [
    { header: 'sku', key: 'sku', width: 20 },
    { header: 'nama_produk', key: 'nama_produk', width: 40 },
    { header: 'satuan', key: 'satuan', width: 15 },
    { header: 'harga_beli', key: 'harga_beli', width: 20 },
    { header: 'harga_jual', key: 'harga_jual', width: 20 },
    { header: 'stok_awal', key: 'stok_awal', width: 15 },
    { header: 'min_stok_alert', key: 'min_stok_alert', width: 15 }
  ];

  // Placeholder data
  sheet.addRow({ 
    sku: '1234567890123', 
    nama_produk: 'Minyak Cengkeh 50ml', 
    satuan: 'botol', 
    harga_beli: 15000, 
    harga_jual: 20000, 
    stok_awal: 50, 
    min_stok_alert: 5 
  });
  sheet.addRow({ 
    sku: '0987654321098', 
    nama_produk: 'Minyak Seree 100ml', 
    satuan: 'botol', 
    harga_beli: 25000, 
    harga_jual: 35000, 
    stok_awal: 20, 
    min_stok_alert: 5 
  });

  // Force SKU column to be interpreted as Text/String in Excel
  sheet.getColumn('sku').numFmt = '@';

  // Format header
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  
  // Trigger download
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_katalog_produk.xlsx';
  a.click();
  window.URL.revokeObjectURL(url);
}

export interface ParsedProduct {
  sku: string;
  name: string;
  categoryName?: string | null;
  unit: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  min_stock_alert: number;
  is_active: boolean;
}

export interface ProductParseResult {
  newProducts: ParsedProduct[];
  updatedProducts: ParsedProduct[];
  newCategoriesToCreate: string[];
  totalRows: number;
}

/**
 * 2. Parse Excel file and check for new/update products without category dependency
 */
export async function parseProductUpload(file: File): Promise<ProductParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const sheet = workbook.getWorksheet(1);
  if (!sheet) {
    throw new Error("File Excel tidak memiliki worksheet yang valid.");
  }

  // Find column indices (case-insensitive)
  const colIdx: Record<string, number> = {};
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value) {
      const headerName = String(cell.value).toLowerCase().trim();
      colIdx[headerName] = colNumber;
    }
  });

  const reqCols = ['sku', 'nama_produk', 'satuan', 'harga_beli', 'harga_jual', 'stok_awal', 'min_stok_alert'];
  for (const c of reqCols) {
    if (!colIdx[c]) throw new Error(`Kolom wajib '${c}' tidak ditemukan pada template Excel.`);
  }

  const rawProductsMap = new Map<string, ParsedProduct>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) { // Skip header
      // Read cell values carefully to handle formulas or rich text
      const getVal = (col: string): any => {
        const idx = colIdx[col];
        if (!idx) return null;
        const cell = row.getCell(idx);
        let val = cell.value;
        if (val && typeof val === 'object' && 'result' in val) {
          val = (val as any).result; // handle formula result
        }
        return val;
      };

      const rawSku = getVal('sku');
      const rawName = getVal('nama_produk');
      if (!rawSku || !rawName) return; // Skip if mandatory missing

      const sku = String(rawSku).trim();
      const name = String(rawName).trim();
      if (!sku || !name) return;

      rawProductsMap.set(sku, {
        sku,
        name,
        categoryName: null,
        unit: String(getVal('satuan') || 'pcs').trim(),
        buy_price: Math.min(Math.max(0, Number(getVal('harga_beli')) || 0), 100000000),
        sell_price: Math.min(Math.max(0, Number(getVal('harga_jual')) || 0), 100000000),
        stock: Math.min(Math.max(0, parseInt(getVal('stok_awal')) || 0), 100000),
        min_stock_alert: Math.min(Math.max(0, parseInt(getVal('min_stok_alert')) || 5), 100000),
        is_active: true
      });
    }
  });

  const rawProducts = Array.from(rawProductsMap.values());

  // Fetch existing products
  const existingProducts = await getProduk();
  const existingSkus = new Set(existingProducts.map(p => p.sku));

  const newProducts: ParsedProduct[] = [];
  const updatedProducts: ParsedProduct[] = [];

  // Determine new vs update products
  for (const p of rawProducts) {
    if (existingSkus.has(p.sku)) {
      updatedProducts.push(p);
    } else {
      newProducts.push(p);
    }
  }

  return {
    newProducts,
    updatedProducts,
    newCategoriesToCreate: [],
    totalRows: rawProducts.length
  };
}

/**
 * 3. Batch upsert products
 */
export async function batchUpsertProducts(parseResult: ProductParseResult) {
  const { newProducts, updatedProducts } = parseResult;
  const allProducts = [...newProducts, ...updatedProducts];
  if (allProducts.length === 0) return;

  // Prepare payload for upsert with category_id: null
  const payload = allProducts.map(p => ({
    sku: p.sku,
    name: p.name,
    category_id: null,
    unit: p.unit || 'pcs',
    buy_price: p.buy_price,
    sell_price: p.sell_price,
    stock: p.stock,
    min_stock_alert: p.min_stock_alert,
    is_active: p.is_active
  }));

  // Batch upsert to Supabase
  const { error } = await supabase
    .from('products')
    .upsert(payload, { onConflict: 'sku' });

  if (error) {
    throw new Error(`Gagal menyimpan produk batch: ${error.message}`);
  }
}
