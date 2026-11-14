import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CheckCircle2,
  Download,
  Printer,
  X,
  Banknote,
  Building2,
} from 'lucide-react';
import { ReceiptPayload } from '../../services/setoranService';
import { formatCurrency } from '../../utils/formatCurrency';

interface SetoranReceiptModalProps {
  receipt: ReceiptPayload | null;
  isOpen: boolean;
  onClose: () => void;
}

const TERBILANG_SATUAN = [
  '',
  'Satu',
  'Dua',
  'Tiga',
  'Empat',
  'Lima',
  'Enam',
  'Tujuh',
  'Delapan',
  'Sembilan',
  'Sepuluh',
  'Sebelas',
];

function terbilang(n: number): string {
  const num = Math.floor(Math.abs(n));
  if (num === 0) return 'Nol';
  if (num < 12) return TERBILANG_SATUAN[num];
  if (num < 20) return `${terbilang(num - 10)} Belas`;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const rem = num % 10;
    return `${TERBILANG_SATUAN[tens]} Puluh${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  if (num < 200) {
    const rem = num % 100;
    return `Seratus${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const rem = num % 100;
    return `${TERBILANG_SATUAN[hundreds]} Ratus${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  if (num < 2000) {
    const rem = num % 1000;
    return `Seribu${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  if (num < 1_000_000) {
    const thousands = Math.floor(num / 1000);
    const rem = num % 1000;
    return `${terbilang(thousands)} Ribu${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  if (num < 1_000_000_000) {
    const millions = Math.floor(num / 1_000_000);
    const rem = num % 1_000_000;
    return `${terbilang(millions)} Juta${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  const billions = Math.floor(num / 1_000_000_000);
  const rem = num % 1_000_000_000;
  return `${terbilang(billions)} Miliar${rem ? ` ${terbilang(rem)}` : ''}`;
}

function formatDateTimeId(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLineDescription(line: ReceiptPayload['lines'][number]): string {
  if (line.allocationTag === 'Kewajiban Pokok') {
    return `${line.itemName} (Kewajiban Pokok)`;
  }
  return `${line.itemName} - ${line.periodLabel} (${line.allocationTag})`;
}

export const SetoranReceiptModal: React.FC<SetoranReceiptModalProps> = ({
  receipt,
  isOpen,
  onClose,
}) => {
  const [downloading, setDownloading] = useState(false);

  if (!isOpen || !receipt) return null;

  const formattedDateTime = formatDateTimeId(receipt.paidAt);
  const terbilangText = `${terbilang(receipt.totalPaid)} Rupiah`;
  const hasPartialRemainder = receipt.lines.some((l) => l.remainingAfter > 0);
  const statusKeterangan = hasPartialRemainder
    ? 'PEMBAYARAN SEBAGIAN (ALOKASI FIFO)'
    : 'LUNAS SESUAI RINCIAN';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      let y = 12;

      // Cooperative Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(
        (receipt.koperasiProfile.nama_koperasi || 'KOPERASI KONSUMEN').toUpperCase(),
        pageWidth / 2,
        y,
        { align: 'center' }
      );
      y += 4.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      if (receipt.koperasiProfile.alamat) {
        const addrLines = doc.splitTextToSize(receipt.koperasiProfile.alamat, pageWidth - margin * 2);
        doc.text(addrLines, pageWidth / 2, y, { align: 'center' });
        y += addrLines.length * 3.2;
      }
      if (receipt.koperasiProfile.telepon) {
        doc.text(`Telp: ${receipt.koperasiProfile.telepon}`, pageWidth / 2, y, { align: 'center' });
        y += 3.5;
      }

      // Divider
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;

      // Document Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('BUKTI SETORAN & PEMBAYARAN ANGGOTA', pageWidth / 2, y, { align: 'center' });
      y += 5.5;

      // Metadata Table (2 columns)
      doc.setFontSize(8);
      const leftX = margin;
      const rightX = pageWidth / 2 + 2;

      doc.setFont('helvetica', 'normal');
      doc.text(`No. Kwitansi : ${receipt.receiptNo}`, leftX, y);
      doc.text(`Tanggal/Jam  : ${formattedDateTime}`, rightX, y);
      y += 4.2;

      doc.text(
        `Nama Anggota : ${receipt.memberName}${receipt.memberPangkat ? ` (${receipt.memberPangkat})` : ''}`,
        leftX,
        y
      );
      doc.text(`NRP          : ${receipt.memberNrp}`, rightX, y);
      y += 4.2;

      doc.setFont('helvetica', 'bold');
      doc.text(`Metode Bayar : ${receipt.paymentMethodLabel.toUpperCase()}`, leftX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`Petugas      : ${receipt.cashierName}`, rightX, y);
      y += 4.5;

      // Line Items Table
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          1: { halign: 'left' },
          2: { halign: 'center', cellWidth: 22 },
          3: { halign: 'right', cellWidth: 28 },
        },
        head: [['No', 'Rincian Pembayaran', 'Ket.', 'Nominal']],
        body: receipt.lines.map((line, idx) => [
          String(idx + 1),
          line.remainingAfter > 0
            ? `${formatLineDescription(line)} (Sisa: ${formatCurrency(line.remainingAfter)})`
            : formatLineDescription(line),
          line.allocationTag,
          formatCurrency(line.amount),
        ]),
        foot: [
          [
            '',
            { content: 'TOTAL DIBAYAR', styles: { fontStyle: 'bold', halign: 'right' } },
            '',
            { content: formatCurrency(receipt.totalPaid), styles: { fontStyle: 'bold', halign: 'right' } },
          ],
        ],
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
        },
      });

      const finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 5 : y + 40;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'italic');
      const terbilangLines = doc.splitTextToSize(
        `Terbilang: # ${terbilangText} #`,
        pageWidth - margin * 2
      );
      doc.text(terbilangLines, margin, finalY);

      let sigY = finalY + terbilangLines.length * 3.5 + 2;
      doc.setFont('helvetica', 'bold');
      doc.text(`Status: ${statusKeterangan}`, margin, sigY);
      sigY += 8;

      // Signature Blocks
      doc.setFont('helvetica', 'normal');
      doc.text('Penyetor,', margin + 15, sigY, { align: 'center' });
      doc.text('Petugas Koperasi,', pageWidth - margin - 18, sigY, { align: 'center' });
      sigY += 13;

      doc.setFont('helvetica', 'bold');
      doc.text(`( ${receipt.memberName} )`, margin + 15, sigY, { align: 'center' });
      doc.text(`( ${receipt.cashierName} )`, pageWidth - margin - 18, sigY, { align: 'center' });

      if (receipt.koperasiProfile.footer_notes) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(receipt.koperasiProfile.footer_notes, pageWidth / 2, sigY + 7, {
          align: 'center',
        });
      }

      const safeNrp = String(receipt.memberNrp || 'ANGGOTA').replace(/[^a-zA-Z0-9_-]/g, '_');
      doc.save(`Kwitansi_${receipt.receiptNo}_${safeNrp}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  const modalContent = (
    <div
      className="setoran-receipt-portal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setoran-receipt-title"
    >
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 10mm;
          }
          body > *:not(.setoran-receipt-portal) {
            display: none !important;
          }
          .setoran-receipt-portal {
            position: static !important;
            inset: auto !important;
            display: block !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .setoran-receipt-no-print {
            display: none !important;
          }
          #printable-setoran-receipt {
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Top Screen Action Header */}
        <div className="setoran-receipt-no-print flex items-center justify-between px-6 py-4 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center gap-2.5 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h2 className="text-sm font-bold leading-tight">
                Pembayaran Berhasil Dicatat
              </h2>
              <p className="text-xs text-emerald-700">
                No. Kwitansi: <span className="font-mono font-semibold">{receipt.receiptNo}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/80 transition-colors cursor-pointer"
            aria-label="Tutup modal kwitansi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Receipt Area */}
        <div className="p-6 max-h-[75vh] overflow-y-auto bg-slate-50/50 print:max-h-none print:overflow-visible print:bg-white print:p-0">
          <div
            id="printable-setoran-receipt"
            className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs text-slate-900"
          >
            {/* Cooperative Kop Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-800">
              <div className="flex items-center gap-3">
                {receipt.koperasiProfile.logo_url ? (
                  <img
                    src={receipt.koperasiProfile.logo_url}
                    alt="Logo Koperasi"
                    className="w-12 h-12 object-contain rounded-lg border border-slate-100"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : null}
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-slate-900 uppercase">
                    {receipt.koperasiProfile.nama_koperasi}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                    {receipt.koperasiProfile.alamat}
                  </p>
                  {receipt.koperasiProfile.telepon ? (
                    <p className="text-xs text-slate-600">
                      Telp: {receipt.koperasiProfile.telepon}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                    receipt.paymentMethod === 'transfer_bank'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  {receipt.paymentMethod === 'transfer_bank' ? (
                    <Building2 className="w-3.5 h-3.5" />
                  ) : (
                    <Banknote className="w-3.5 h-3.5" />
                  )}
                  {receipt.paymentMethod === 'transfer_bank' ? 'TRANSFER BANK' : 'TUNAI'}
                </span>
                <p className="text-[11px] font-mono text-slate-500 mt-1.5">
                  {receipt.receiptNo}
                </p>
              </div>
            </div>

            {/* Receipt Title */}
            <div className="text-center my-4">
              <h1
                id="setoran-receipt-title"
                className="text-sm font-extrabold tracking-wider uppercase text-slate-900 underline decoration-slate-300 underline-offset-4"
              >
                BUKTI SETORAN &amp; PEMBAYARAN ANGGOTA
              </h1>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs bg-slate-50 rounded-lg p-3.5 border border-slate-200 mb-4">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">No. Kwitansi</span>
                <span className="font-mono font-bold text-slate-900">{receipt.receiptNo}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Tanggal &amp; Jam</span>
                <span className="font-medium text-slate-800">{formattedDateTime}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Nama Anggota</span>
                <span className="font-bold text-slate-900">
                  {receipt.memberName}
                  {receipt.memberPangkat ? ` (${receipt.memberPangkat})` : ''}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">NRP</span>
                <span className="font-mono font-semibold text-slate-800">{receipt.memberNrp}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Metode Bayar</span>
                <span className="font-bold text-slate-900">
                  {receipt.paymentMethodLabel.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Petugas Penerima</span>
                <span className="font-medium text-slate-800">{receipt.cashierName}</span>
              </div>
            </div>

            {/* Itemized Allocation Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-2 px-3 text-center font-semibold w-10">No</th>
                    <th className="py-2 px-3 text-left font-semibold">Rincian Item &amp; Periode</th>
                    <th className="py-2 px-3 text-center font-semibold w-28">Kategori</th>
                    <th className="py-2 px-3 text-right font-semibold w-32">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {receipt.lines.map((line, index) => (
                    <tr key={line.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 text-center text-slate-500">{index + 1}</td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900">
                          {formatLineDescription(line)}
                        </div>
                        {line.remainingAfter > 0 ? (
                          <div className="text-[11px] text-amber-700 mt-0.5">
                            Pembayaran sebagian &bull; Sisa periode ini: {formatCurrency(line.remainingAfter)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            line.allocationTag === 'Tunggakan'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : line.allocationTag === 'Kewajiban Pokok'
                              ? 'bg-violet-50 text-violet-800 border-violet-200'
                              : 'bg-sky-50 text-sky-800 border-sky-200'
                          }`}
                        >
                          {line.allocationTag}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold font-mono text-slate-900">
                        {formatCurrency(line.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td colSpan={3} className="py-2.5 px-3 text-right font-extrabold text-slate-900 uppercase">
                      Total Dibayar
                    </td>
                    <td className="py-2.5 px-3 text-right font-extrabold font-mono text-sm text-emerald-700">
                      {formatCurrency(receipt.totalPaid)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Terbilang & Settlement Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 mb-6">
              <div className="text-slate-700 italic">
                <span className="font-semibold not-italic text-slate-900">Terbilang:</span> # {terbilangText} #
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${
                  hasPartialRemainder
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {statusKeterangan}
              </span>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 text-center text-xs pt-2">
              <div>
                <p className="text-slate-600 mb-14">Penyetor,</p>
                <p className="font-bold text-slate-900 border-t border-slate-300 pt-1.5 inline-block px-6">
                  {receipt.memberName}
                </p>
              </div>
              <div>
                <p className="text-slate-600 mb-14">Petugas Koperasi,</p>
                <p className="font-bold text-slate-900 border-t border-slate-300 pt-1.5 inline-block px-6">
                  {receipt.cashierName}
                </p>
              </div>
            </div>

            {receipt.koperasiProfile.footer_notes ? (
              <p className="text-center text-[11px] text-slate-400 mt-5 pt-3 border-t border-dashed border-slate-200">
                {receipt.koperasiProfile.footer_notes}
              </p>
            ) : null}
          </div>
        </div>

        {/* Bottom Screen Action Footer */}
        <div className="setoran-receipt-no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Tutup
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-600 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Menyiapkan PDF...' : 'Unduh Bukti (.pdf)'}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Cetak Kwitansi
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};

export default SetoranReceiptModal;
