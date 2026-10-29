/**
 * retailExporter.ts
 * Client-side export utilities for Laporan Retail & Inventori POS
 * Uses ExcelJS (already in project) for .xlsx and window.print() for PDF
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EndOfDayReport, FastMovingProduct, StockValuation, CashierShift } from '../services/retail-report.service';
import type { KoperasiProfile } from '../services/settingsService';

const formatRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

/**
 * Generate and download tabular retail & POS reconciliation report as landscape A4 PDF.
 */
export async function exportRetailReportToPdf(
  eod: EndOfDayReport | null,
  dateRange: { startDate: string; endDate: string },
  koperasiProfile?: KoperasiProfile | null,
  autoSave = true
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // ── 1. Header Identitas Koperasi ───────────────────────────────────────────
  const namaKoperasi = (koperasiProfile?.nama_koperasi || 'KOPERASI PRIMKOPPOL').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(namaKoperasi, marginX, 15);

  let currentY = 20;
  const contactDetails = [
    koperasiProfile?.alamat,
    koperasiProfile?.telepon ? `Telp: ${koperasiProfile.telepon}` : ''
  ].filter(Boolean).join(' | ');

  if (contactDetails) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(contactDetails, marginX, currentY);
    currentY += 5;
  }

  // Judul Laporan & Periode
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(13, 148, 136); // #0D9488 emerald-600
  doc.text('LAPORAN PENJUALAN RETAIL & KASIR', marginX, currentY + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`Periode: ${dateRange.startDate} s/d ${dateRange.endDate}`, marginX, currentY + 7);

  // Divider Line
  currentY += 10;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  currentY += 4;

  // ── 2. Ringkasan Rekonsiliasi (Summary Metrics Cards) ───────────────────────
  let totalAmount = 0;
  let totalCash = 0;
  let totalDeposit = 0;
  let totalCredit = 0;

  const rawTransactions = eod?.transactions || [];
  const bodyData: any[][] = [];

  for (const t of rawTransactions) {
    const amt = Number(t.total_amount) || 0;
    const cash = Number(t.paid_cash) || 0;
    const dep = Number(t.paid_deposit) || 0;
    const cred = Number(t.paid_credit) || 0;

    totalAmount += amt;
    totalCash += cash;
    totalDeposit += dep;
    totalCredit += cred;

    const timeRaw = t.completed_at || t.created_at || '-';
    let timeStr = timeRaw;
    if (timeRaw !== '-') {
      try {
        const d = new Date(timeRaw);
        if (!isNaN(d.getTime())) {
          timeStr = d.toLocaleString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      } catch {
        timeStr = timeRaw;
      }
    }

    bodyData.push([
      timeStr,
      t.sale_number || '-',
      t.pengelola?.nama || '-',
      t.anggota?.nama || 'Non-Anggota',
      formatRp(amt),
      formatRp(cash),
      formatRp(dep),
      formatRp(cred)
    ]);
  }

  // Fallback to eod summary if transactions array wasn't provided or empty
  const displayOmzet = eod?.totalOmzet !== undefined && eod.totalOmzet > 0 ? eod.totalOmzet : totalAmount;
  const displayCash = eod?.paidCash !== undefined && eod.paidCash > 0 ? eod.paidCash : totalCash;
  const displayDeposit = eod?.paidDeposit !== undefined && eod.paidDeposit > 0 ? eod.paidDeposit : totalDeposit;
  const displayCredit = eod?.paidCredit !== undefined && eod.paidCredit > 0 ? eod.paidCredit : totalCredit;

  const cardGap = 4;
  const contentWidth = pageWidth - (marginX * 2);
  const cardWidth = (contentWidth - (cardGap * 3)) / 4;
  const cardHeight = 14;

  const summaryCards = [
    { label: 'TOTAL OMZET', value: formatRp(displayOmzet), color: [13, 148, 136] },
    { label: 'UANG TUNAI (CASH)', value: formatRp(displayCash), color: [16, 185, 129] },
    { label: 'POTONG SIMPANAN', value: formatRp(displayDeposit), color: [59, 130, 246] },
    { label: 'BON TOKO / PIUTANG', value: formatRp(displayCredit), color: [245, 158, 11] }
  ];

  summaryCards.forEach((card, idx) => {
    const cardX = marginX + idx * (cardWidth + cardGap);
    // Background card box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    // Accent line on left of card
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.rect(cardX, currentY, 1.5, cardHeight, 'F');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(card.label, cardX + 4, currentY + 4.5);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(card.value, cardX + 4, currentY + 10.5);
  });

  currentY += cardHeight + 5;

  // ── 3. Tabel Log Transaksi Penjualan ────────────────────────────────────────
  const hasData = bodyData.length > 0;
  const tableRows = hasData
    ? bodyData
    : [['Tidak ada data transaksi pada periode ini', '', '', '', '', '', '', '']];

  const footRows: any[] | undefined = hasData
    ? [
        [
          { content: 'TOTAL REKONSILIASI', colSpan: 4, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
          formatRp(totalAmount),
          formatRp(totalCash),
          formatRp(totalDeposit),
          formatRp(totalCredit)
        ]
      ]
    : undefined;

  autoTable(doc, {
    startY: currentY,
    head: [['WAKTU', 'NO. NOTA', 'KASIR', 'PEMBELI', 'TOTAL', 'TUNAI', 'SIMPANAN', 'BON TOKO']],
    body: tableRows,
    foot: footRows,
    theme: 'grid',
    margin: { left: marginX, right: marginX, bottom: 16 },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [51, 65, 85],
      valign: 'middle'
    },
    headStyles: {
      fillColor: [13, 148, 136],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 34 },
      2: { cellWidth: 33 },
      3: { cellWidth: 44 },
      4: { halign: 'right', cellWidth: 31 },
      5: { halign: 'right', cellWidth: 31 },
      6: { halign: 'right', cellWidth: 31 },
      7: { halign: 'right', cellWidth: 31 }
    }
  });

  // ── 4. Footer Dokumen (Waktu Cetak & Nomor Halaman) ──────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, marginX, pageHeight - 8);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
  }

  // ── 5. Simpan Dokumen ───────────────────────────────────────────────────────
  if (autoSave) {
    doc.save(`laporan-retail-${dateRange.startDate}-sd-${dateRange.endDate}.pdf`);
  }
  return doc;
}


/**
 * Export the report tabs to a multi-sheet .xlsx file
 */
export async function exportRetailToExcel(
  period: { startDate: string; endDate: string },
  eod: EndOfDayReport | null,
  fastMoving: FastMovingProduct[],
  stock: StockValuation | null,
  shifts?: CashierShift[]
) {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIMKOP Enterprise';
    wb.created = new Date();

    // ── Sheet: Rekonsiliasi Shift Kasir ─────────────────────────────────────
    const shiftList = shifts && shifts.length > 0 ? shifts : (eod?.shifts || []);
    if (shiftList.length > 0) {
      const wsShift = wb.addWorksheet('Rekonsiliasi Shift Kasir');
      wsShift.addRow(['LAPORAN RIWAYAT SESI SHIFT & REKONSILIASI KASIR - SIMKOP']);
      wsShift.addRow([`Periode: ${period.startDate} s/d ${period.endDate}`]);
      wsShift.addRow([]);
      wsShift.addRow([
        'No. Shift', 'Waktu Buka', 'Waktu Tutup', 'Kasir',
        'Modal Awal', 'Penjualan Tunai', 'Estimasi Total Kas', 'Uang Fisik Kasir',
        'Selisih Kas', 'Status', 'Catatan'
      ]);
      for (const s of shiftList) {
        const diffText = s.difference === 0 ? 'Seimbang (Rp 0)' : `${s.difference > 0 ? '+' : ''}Rp ${s.difference.toLocaleString('id-ID')}`;
        wsShift.addRow([
          s.shift_number,
          s.opened_at,
          s.closed_at || '-',
          s.cashier_name || '-',
          s.initial_cash,
          s.cash_sales,
          s.expected_cash,
          s.actual_cash,
          diffText,
          s.status.toUpperCase(),
          s.notes || '-'
        ]);
      }
    }

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
    throw e;
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
