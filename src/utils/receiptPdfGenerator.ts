import jsPDF from 'jspdf';
import { KoperasiProfile, DEFAULT_KOPERASI_PROFILE } from '../services/settingsService';

export interface ReceiptItem {
  id?: string;
  name: string;
  qty: number;
  unit?: string;
  price: number;
}

export interface ReceiptPaymentInfo {
  paidCash?: number;
  paidDeposit?: number;
  paidCredit?: number;
  scheme?: string;
}

export interface ReceiptTransactionData {
  saleNumber?: string;
  date?: string | Date;
  cashierName?: string;
  memberName?: string;
  cart: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment?: ReceiptPaymentInfo;
  profile?: Partial<KoperasiProfile>;
}

const formatRp = (num: number = 0) => 'Rp ' + Math.round(num).toLocaleString('id-ID');

/**
 * Calculates estimated dynamic page height in mm for 80mm thermal receipt roll
 */
function calculateReceiptHeight(data: ReceiptTransactionData): number {
  let estimatedHeight = 65; // Header, metadata, spacing, and footer base
  
  // Extra height for multiline address or footer notes
  const alamat = data.profile?.alamat || DEFAULT_KOPERASI_PROFILE.alamat;
  const approxAlamatLines = Math.max(1, Math.ceil(alamat.length / 32));
  estimatedHeight += approxAlamatLines * 4;

  const footerNotes = data.profile?.footer_notes !== undefined ? data.profile.footer_notes : DEFAULT_KOPERASI_PROFILE.footer_notes;
  if (footerNotes) {
    const approxFooterLines = Math.max(1, Math.ceil(footerNotes.length / 36));
    estimatedHeight += approxFooterLines * 4;
  }

  // Items: approx 11mm each (name + qty line + margin)
  estimatedHeight += (data.cart?.length || 0) * 11;
  // Totals block
  estimatedHeight += 20;
  // Payment block
  if (data.payment) {
    let paymentRows = 1; // Change row
    if ((data.payment.paidCash || 0) > 0) paymentRows++;
    if ((data.payment.paidDeposit || 0) > 0) paymentRows++;
    if ((data.payment.paidCredit || 0) > 0) paymentRows++;
    estimatedHeight += paymentRows * 5 + 10;
  }
  return Math.max(125, estimatedHeight);
}

/**
 * Generates an 80mm thermal-style receipt PDF and prompts download
 */
export function generateReceiptPdf(
  data: ReceiptTransactionData,
  autoSave: boolean = true
): jsPDF {
  const pageHeight = calculateReceiptHeight(data);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, pageHeight]
  });

  const pageWidth = 80;
  const left = 5;
  const right = 75;
  const center = 40;
  const printWidth = right - left;

  const profile = {
    nama_koperasi: data.profile?.nama_koperasi || DEFAULT_KOPERASI_PROFILE.nama_koperasi,
    alamat: data.profile?.alamat || DEFAULT_KOPERASI_PROFILE.alamat,
    telepon: data.profile?.telepon !== undefined ? data.profile.telepon : DEFAULT_KOPERASI_PROFILE.telepon,
    terminal_name: data.profile?.terminal_name !== undefined ? data.profile.terminal_name : DEFAULT_KOPERASI_PROFILE.terminal_name,
    footer_notes: data.profile?.footer_notes !== undefined ? data.profile.footer_notes : DEFAULT_KOPERASI_PROFILE.footer_notes
  };

  let y = 8;

  // Header: Koperasi Name (multiline support)
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  const namaLines: string[] = doc.splitTextToSize(profile.nama_koperasi, printWidth);
  namaLines.forEach((line) => {
    doc.text(line, center, y, { align: 'center' });
    y += 4.5;
  });
  
  // Header: Address (multiline support with precise y-advance)
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  const alamatLines: string[] = doc.splitTextToSize(profile.alamat, printWidth);
  alamatLines.forEach((line) => {
    doc.text(line, center, y, { align: 'center' });
    y += 3.5;
  });
  
  // Header: Contact & Terminal (separated cleanly)
  const contactParts: string[] = [];
  if (profile.telepon) contactParts.push(`Telp: ${profile.telepon}`);
  if (profile.terminal_name) contactParts.push(profile.terminal_name);
  if (contactParts.length > 0) {
    const contactText = contactParts.join(' | ');
    const contactLines: string[] = doc.splitTextToSize(contactText, printWidth);
    contactLines.forEach((line) => {
      doc.text(line, center, y, { align: 'center' });
      y += 3.5;
    });
  }

  // Divider
  y += 1.5;
  drawDashedLine(doc, left, right, y);

  // Metadata: Transaction Details
  y += 4;
  const saleNum = data.saleNumber || `INV-${Date.now()}`;
  const trxDate = data.date ? new Date(data.date) : new Date();
  const dateStr = trxDate.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }) + ' ' + trxDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  doc.setFontSize(7.5);
  doc.text(`No. Trx : ${saleNum}`, left, y);
  y += 3.5;
  doc.text(`Waktu   : ${dateStr}`, left, y);
  y += 3.5;
  doc.text(`Kasir   : ${data.cashierName || 'Kasir Utama'}`, left, y);
  
  if (data.memberName) {
    y += 3.5;
    doc.text(`Anggota : ${data.memberName}`, left, y);
  }

  // Divider
  y += 3;
  drawDashedLine(doc, left, right, y);

  // Items Header
  y += 4;
  doc.setFont('courier', 'bold');
  doc.text('ITEM', left, y);
  doc.text('TOTAL', right, y, { align: 'right' });
  
  y += 2;
  drawDashedLine(doc, left, right, y);

  doc.setFont('courier', 'normal');
  (data.cart || []).forEach((item) => {
    y += 4;
    // Item name
    doc.setFont('courier', 'bold');
    const itemNameLines: string[] = doc.splitTextToSize(item.name, printWidth);
    itemNameLines.forEach((nameLine) => {
      doc.text(nameLine, left, y);
      y += 3.5;
    });
    
    doc.setFont('courier', 'normal');
    const unitLabel = item.unit ? ` ${item.unit}` : '';
    const qtyPrice = `${item.qty}${unitLabel} x ${formatRp(item.price)}`;
    const lineTotal = formatRp(item.qty * item.price);
    
    doc.text(qtyPrice, left, y);
    doc.text(lineTotal, right, y, { align: 'right' });
  });

  // Divider
  y += 3;
  drawDashedLine(doc, left, right, y);

  // Totals
  y += 4;
  doc.setFont('courier', 'normal');
  doc.text('Subtotal Kotor', left, y);
  doc.text(formatRp(data.subtotal), right, y, { align: 'right' });

  if (data.discount > 0) {
    y += 3.5;
    doc.text('Diskon Anggota (5%)', left, y);
    doc.text('- ' + formatRp(data.discount), right, y, { align: 'right' });
  }

  y += 4.5;
  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.text('TOTAL AKHIR', left, y);
  doc.text(formatRp(data.total), right, y, { align: 'right' });

  // Payment Breakdown
  if (data.payment) {
    y += 3;
    drawDashedLine(doc, left, right, y);

    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    y += 4;
    doc.text('PEMBAYARAN', left, y);

    doc.setFont('courier', 'normal');
    if ((data.payment.paidCash || 0) > 0) {
      y += 3.5;
      doc.text('Tunai', left, y);
      doc.text(formatRp(data.payment.paidCash), right, y, { align: 'right' });
    }

    if ((data.payment.paidDeposit || 0) > 0) {
      y += 3.5;
      doc.text('Simpanan Belanja', left, y);
      doc.text(formatRp(data.payment.paidDeposit), right, y, { align: 'right' });
    }

    if ((data.payment.paidCredit || 0) > 0) {
      y += 3.5;
      doc.text('Bon Toko (Gaji)', left, y);
      doc.text(formatRp(data.payment.paidCredit), right, y, { align: 'right' });
    }

    const totalPaid = (data.payment.paidCash || 0) + (data.payment.paidDeposit || 0) + (data.payment.paidCredit || 0);
    const change = Math.max(0, totalPaid - data.total);
    y += 4;
    doc.setFont('courier', 'bold');
    doc.text('Kembalian', left, y);
    doc.text(formatRp(change), right, y, { align: 'right' });
  }

  // Footer
  y += 4;
  drawDashedLine(doc, left, right, y);
  
  if (profile.footer_notes) {
    y += 3.5;
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    const footerLines: string[] = doc.splitTextToSize(profile.footer_notes, printWidth);
    footerLines.forEach((line) => {
      doc.text(line, center, y, { align: 'center' });
      y += 3;
    });
  }

  y += 3.5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.text('Terima kasih atas kunjungan Anda', center, y, { align: 'center' });
  y += 3.5;
  doc.setFontSize(6.5);
  doc.text('Simpan struk ini sebagai bukti pembayaran sah', center, y, { align: 'center' });

  if (autoSave) {
    const filename = `struk-${saleNum}.pdf`;
    doc.save(filename);
  }

  return doc;
}

/**
 * Draws a dashed line across the receipt width
 */
function drawDashedLine(doc: jsPDF, x1: number, x2: number, y: number) {
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.setLineWidth(0.2);
  doc.line(x1, y, x2, y);
  doc.setLineDashPattern([], 0); // reset to solid
}
