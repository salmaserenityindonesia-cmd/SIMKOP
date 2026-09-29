import React, { useRef } from 'react';
import { X, Printer, CheckCircle2 } from 'lucide-react';

interface ReceiptData {
  transactionId: string;
  member: {
    id: string;
    nama: string;
    nrp: string;
  };
  depositName: string;
  amount: number;
  paymentMethod: string;
  date: string;
}

interface Props {
  data: ReceiptData;
  onClose: () => void;
}

export default function WithdrawalReceiptModal({ data, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (printRef.current) {
      const printContents = printRef.current.innerHTML;
      const originalContents = document.body.innerHTML;
      
      const printWindow = window.open('', '', 'height=600,width=800');
      if (printWindow) {
        printWindow.document.write('<html><head><title>Cetak Struk Penarikan</title>');
        printWindow.document.write('<style>');
        printWindow.document.write(`
          body { font-family: monospace; font-size: 14px; margin: 0; padding: 20px; width: 300px; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .text-lg { font-size: 1.125rem; }
          .text-sm { font-size: 0.875rem; }
          .text-xs { font-size: 0.75rem; }
          .mb-1 { margin-bottom: 0.25rem; }
          .mb-2 { margin-bottom: 0.5rem; }
          .mb-4 { margin-bottom: 1rem; }
          .mt-2 { margin-top: 0.5rem; }
          .mt-4 { margin-top: 1rem; }
          .border-t { border-top: 1px dashed #000; padding-top: 0.5rem; }
          .border-b { border-bottom: 1px dashed #000; padding-bottom: 0.5rem; }
          .flex { display: flex; justify-content: space-between; }
        `);
        printWindow.document.write('</style></head><body>');
        printWindow.document.write(printContents);
        printWindow.document.write('</body></html>');
        
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <h2 className="font-bold">Penarikan Berhasil</h2>
          </div>
          <button onClick={onClose} className="text-emerald-700/60 hover:text-emerald-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 flex flex-col items-center">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-black text-slate-800 mb-1">Rp {data.amount.toLocaleString('id-ID')}</h3>
          <p className="text-slate-500 mb-6 text-center">{data.depositName}<br/>telah dicairkan ke {data.paymentMethod}</p>
          
          {/* Hidden thermal print layout */}
          <div style={{ display: 'none' }}>
            <div ref={printRef}>
              <div className="text-center font-bold text-lg mb-1">SIMKOP ENTERPRISE</div>
              <div className="text-center text-xs mb-4">Koperasi Digital Mandiri</div>
              
              <div className="text-center font-bold mb-2">BUKTI PENARIKAN SIMPANAN</div>
              <div className="text-xs mb-4 text-center">{new Date(data.date).toLocaleString('id-ID')}</div>
              
              <div className="border-t border-b mb-2 mt-2">
                <div className="flex text-sm mb-1">
                  <span>Trx ID:</span>
                  <span>{data.transactionId.substring(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex text-sm mb-1">
                  <span>Anggota:</span>
                  <span>{data.member.nama}</span>
                </div>
                <div className="flex text-sm mb-1">
                  <span>NRP:</span>
                  <span>{data.member.nrp}</span>
                </div>
                <div className="flex text-sm">
                  <span>Simpanan:</span>
                  <span>{data.depositName}</span>
                </div>
              </div>
              
              <div className="flex text-sm mb-1 mt-2">
                <span>Total Penarikan:</span>
                <span className="font-bold">Rp {data.amount.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex text-xs mb-4">
                <span>Metode:</span>
                <span>{data.paymentMethod}</span>
              </div>
              
              <div className="text-center text-xs mt-4">
                Terima kasih atas kepercayaan Anda.<br />
                Simpan struk ini sebagai bukti transaksi yang sah.
              </div>
            </div>
          </div>

          <div className="w-full space-y-3">
            <button 
              onClick={handlePrint}
              className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-200"
            >
              <Printer className="w-5 h-5" /> Cetak Struk (Thermal)
            </button>
            <button 
              onClick={onClose}
              className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-xl hover:bg-slate-100 transition-colors"
            >
              Tutup & Kembali
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
