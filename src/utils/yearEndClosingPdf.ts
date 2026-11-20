import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_KOPERASI_PROFILE,
  type KoperasiProfile,
} from '../services/settingsService';
import type {
  RatShuSettings,
  YearEndClosingPreview,
} from '../services/yearEndClosingService';

export interface ExportYearEndClosingPdfParams {
  preview: YearEndClosingPreview;
  settings: RatShuSettings;
  profile?: Partial<KoperasiProfile>;
  autoSave?: boolean;
}

const formatRp = (n: number): string =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

/**
 * Mencetak dokumen PDF resmi Berita Acara Tutup Buku Akhir Tahun & Pembagian SHU (RAT).
 */
export function exportYearEndClosingPdf({
  preview,
  settings,
  profile,
  autoSave = true,
}: ExportYearEndClosingPdfParams): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const namaKoperasi =
    profile?.nama_koperasi || DEFAULT_KOPERASI_PROFILE.nama_koperasi;
  const alamat = profile?.alamat || DEFAULT_KOPERASI_PROFILE.alamat;
  const telepon = profile?.telepon || DEFAULT_KOPERASI_PROFILE.telepon;

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  // 1. Kop Surat Koperasi
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(namaKoperasi.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${alamat}${telepon ? ` | Telp: ${telepon}` : ''}`, pageWidth / 2, y, {
    align: 'center',
  });
  y += 3;

  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // 2. Judul Berita Acara
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(
    'BERITA ACARA TUTUP BUKU AKHIR TAHUN & PEMBAGIAN SHU (RAT)',
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const statusLabel = preview.isClosed
    ? 'TERKUNCI (CLOSED)'
    : 'PRATINJAU DRAFT (BELUM TUTUP BUKU)';
  const payoutLabel =
    settings.payout_method === 'CASH_PAYOUT'
      ? 'Dibayarkan Tunai / Transfer (Kas Keluar)'
      : `Dikreditkan ke Simpanan (${settings.target_deposit_type_code || 'BELANJA'})`;

  doc.text(
    `Tahun Buku: ${preview.fiscalYear} | Status: ${statusLabel}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 4.5;
  doc.setFontSize(8.5);
  doc.text(
    `Tanggal Tutup Buku: ${preview.closingDate} | Pembukaan Saldo Tahun Baru: ${preview.openingNextYearDate} | Penyaluran: ${payoutLabel}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 6;

  // 3. Tabel Akun Riil (Carry Forward ke 1 Januari Tahun Baru)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `I. NERACA SALDO AKHIR TAHUN (AKUN RIIL DIBAWA KE 1 JANUARI ${preview.fiscalYear + 1})`,
    margin,
    y
  );
  y += 2.5;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Pos Akun Riil', 'Saldo Akhir 31 Des', 'Saldo Awal 1 Jan Tahun Baru']],
    body: [
      [
        'Saldo Kas Bersih Brankas',
        formatRp(preview.closingCashBalance),
        formatRp(preview.postShuCashBalance),
      ],
      [
        'Akumulasi Simpanan Anggota',
        formatRp(preview.closingMemberSavings),
        formatRp(preview.postShuMemberSavings),
      ],
      [
        'Sisa Piutang Pinjaman Aktif',
        formatRp(preview.closingLoanReceivable),
        formatRp(preview.closingLoanReceivable),
      ],
      [
        'Sisa Piutang Bon Toko (Potong Gaji)',
        formatRp(preview.closingStoreReceivable),
        formatRp(preview.closingStoreReceivable),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 30, 54], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY ?? y + 32) + 7;

  // 4. Tabel Laba/Rugi & Alokasi SHU RAT
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `II. IKHTISAR KINERJA USAHA & ALOKASI SHU TAHUN BUKU ${preview.fiscalYear} (DINOLKAN UNTUK ${preview.fiscalYear + 1})`,
    margin,
    y
  );
  y += 2.5;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Komponen Laba / SHU & Alokasi RAT', 'Rasio', 'Nominal (Rp)']],
    body: [
      ['Total Omzet Penjualan POS', '-', formatRp(preview.grossSales)],
      ['HPP / Harga Modal Barang', '-', formatRp(preview.cogs)],
      ['Laba Kotor Toko Retail', '-', formatRp(preview.grossProfit)],
      ['Realisasi Margin Pembiayaan Barang', '-', formatRp(preview.goodsFinancingMargin)],
      ['Beban Operasional', '-', formatRp(preview.opex)],
      ['SHU BERSIH TAHUN BUKU', '100%', formatRp(preview.netShuAmount)],
      [
        'Cadangan Modal Koperasi',
        `${settings.reserve_fund_pct}%`,
        formatRp(preview.reserveFundAmount),
      ],
      [
        'Bagian SHU Anggota (Total)',
        `${settings.member_shu_pct}%`,
        formatRp(preview.memberShuTotal),
      ],
      [
        '  • Jasa Usaha / Transaksi Anggota',
        `${settings.member_business_pct}%`,
        formatRp(preview.jasaUsahaPool),
      ],
      [
        '  • Jasa Modal Simpanan Anggota',
        `${settings.member_capital_pct}%`,
        formatRp(preview.jasaModalPool),
      ],
      [
        'Dana Pengurus / Sosial / Pendidikan',
        `${settings.other_fund_pct}%`,
        formatRp(preview.otherFundAmount),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right' },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY ?? y + 65) + 7;

  // 5. Daftar Pembagian SHU per Anggota
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `III. RINCIAN HAK SHU PER ANGGOTA AKTIF (${preview.memberRows.length} ANGGOTA)`,
    margin,
    y
  );
  y += 2.5;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        'No',
        'NRP',
        'Nama Anggota',
        'Simpanan',
        'Transaksi',
        'Jasa Modal',
        'Jasa Usaha',
        'Total SHU',
      ],
    ],
    body: preview.memberRows.map((row, idx) => [
      String(idx + 1),
      row.nrp || '-',
      row.nama,
      formatRp(row.totalSavingsContribution),
      formatRp(row.totalTransactionContribution),
      formatRp(row.jasaModalAmount),
      formatRp(row.jasaUsahaAmount),
      formatRp(row.totalShuReceived),
    ]),
    foot: [
      [
        '',
        '',
        'TOTAL',
        formatRp(preview.totalAllMembersSavings),
        formatRp(preview.totalAllMembersTransactions),
        formatRp(
          preview.memberRows.reduce((s, r) => s + r.jasaModalAmount, 0)
        ),
        formatRp(
          preview.memberRows.reduce((s, r) => s + r.jasaUsahaAmount, 0)
        ),
        formatRp(preview.totalDistributedToMembers),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 30, 54], textColor: 255, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
  });

  // 6. Blok Tanda Tangan Pengesahan RAT
  const finalY = ((doc as any).lastAutoTable?.finalY ?? y + 30) + 12;
  const pageHeight = doc.internal.pageSize.getHeight();
  let sigY = finalY;
  if (sigY + 32 > pageHeight) {
    doc.addPage();
    sigY = 24;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const colW = (pageWidth - margin * 2) / 3;
  const cols = ['Ketua Koperasi', 'Bendahara', 'Pengawas RAT'];
  cols.forEach((roleLabel, idx) => {
    const cx = margin + colW * idx + colW / 2;
    doc.text(roleLabel, cx, sigY, { align: 'center' });
    doc.text('( .............................. )', cx, sigY + 20, { align: 'center' });
  });

  if (autoSave) {
    doc.save(`Berita-Acara-Tutup-Buku-SHU-RAT-${preview.fiscalYear}.pdf`);
  }

  return doc;
}
