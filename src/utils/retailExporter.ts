/**
 * retailExporter.ts
 * Client-side export utilities for Laporan Retail & Inventori POS
 * Uses ExcelJS (already in project) for .xlsx and window.print() for PDF
 */

import type { EndOfDayReport, FastMovingProduct, StockValuation } from '../services/retail-report.service';

const formatRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

/**
 * Export the three report tabs to a multi-sheet .xlsx file
 */
export async function exportRetailToExcel(
  period: { startDate: string; endDate: string },
  eod: EndOfDayReport | null,
  fastMoving: FastMovingProduct[],
  stock: StockValuation | null
) {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIMKOP Enterprise';
    wb.created = new Date();

    // ── Sheet 1: Tutup Kasir ────────────────────────────────────────────────
    if (eod) {
      const ws = wb.addWorksheet('Tutup Kasir Harian');
      ws.addRow(['LAPORAN TUTUP KASIR HARIAN - SIMKOP']);
      ws.addRow([`Periode: ${period.startDate} s/d ${period.endDate}`]);
      ws.addRow([]);
      ws.addRow(['RINGKASAN REKONSILIASI']);
      ws.addRow(['Total Omzet', eod.totalOmzet]);
      ws.addRow(['Total Diskon', eod.totalDiscount]);
      ws.addRow(['Uang Tunai (paid_cash)', eod.paidCash]);
      ws.addRow(['Potong Simpanan (paid_deposit)', eod.paidDeposit]);
      ws.addRow(['Bon Toko / Piutang (paid_credit)', eod.paidCredit]);
      ws.addRow([]);
      ws.addRow(['LOG TRANSAKSI']);
      ws.addRow([
        'Waktu', 'No. Nota', 'Kasir', 'Pembeli',
        'Total', 'Tunai', 'Simpanan', 'Bon Toko', 'Status'
      ]);
      for (const t of eod.transactions) {
        ws.addRow([
          t.completed_at || t.created_at,
          t.sale_number,
          t.pengelola?.nama || '-',
          t.anggota?.nama || 'Non-Anggota',
          t.total_amount,
          t.paid_cash,
          t.paid_deposit,
          t.paid_credit,
          t.sale_status || '-'
        ]);
      }
    }

    // ── Sheet 2: Produk Terlaris ────────────────────────────────────────────
    if (fastMoving.length > 0) {
      const ws = wb.addWorksheet('Produk Terlaris & Margin');
      ws.addRow(['LAPORAN PRODUK TERLARIS & ANALISIS MARGIN LABA']);
      ws.addRow([`Periode: ${period.startDate} s/d ${period.endDate}`]);
      ws.addRow([]);
      ws.addRow(['Peringkat', 'SKU', 'Nama Produk', 'Kategori', 'Qty Terjual',
        'Total Omzet', 'Modal HPP', 'Laba Kotor', 'Margin Laba (%)']);
      for (const p of fastMoving) {
        ws.addRow([
          p.rank,
          p.sku,
          p.name,
          p.category,
          p.qty,
          p.omzet,
          p.hpp,
          p.labaKotor,
          p.margin.toFixed(2) + '%'
        ]);
      }
    }

    // ── Sheet 3: Valuasi Stok ───────────────────────────────────────────────
    if (stock) {
      const ws = wb.addWorksheet('Status Stok & Valuasi');
      ws.addRow(['LAPORAN STATUS STOK & VALUASI ASET GUDANG']);
      ws.addRow([`Data per: ${new Date().toLocaleDateString('id-ID')}`]);
      ws.addRow([]);
      ws.addRow(['RINGKASAN VALUASI']);
      ws.addRow(['Total Valuasi Aset (HPP)', stock.totalValuasiAset]);
      ws.addRow(['Potensi Nilai Jual', stock.potensiPenjualan]);
      ws.addRow(['Produk Kritis/Butuh Restock', stock.kritisCount]);
      ws.addRow([]);
      ws.addRow(['SKU', 'Nama Produk', 'Stok Fisik', 'Status', 'Harga Beli',
        'Harga Jual', 'Valuasi Aset']);
      for (const item of stock.items) {
        ws.addRow([
          item.sku,
          item.name,
          item.stock,
          item.status.toUpperCase(),
          item.buy_price,
          item.sell_price,
          item.valuasiAset
        ]);
      }
    }

    // ── Download ────────────────────────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-retail-${period.startDate}-${period.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Excel export error:', e);
    alert('Gagal export Excel.');
  }
}

/**
 * Export to PDF using browser print dialog
 */
export function printRetailPDF(title: string) {
  const originalTitle = document.title;
  document.title = title;
  window.print();
  document.title = originalTitle;
}

/** Convenient formatter re-export for page use */
export { formatRp };
