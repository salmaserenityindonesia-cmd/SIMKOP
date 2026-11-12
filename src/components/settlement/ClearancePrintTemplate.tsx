import { forwardRef } from 'react';
import { SettlementSummary } from '../../services/settlementService';
import { Anggota } from '../../services/koperasiService';
import { formatCurrency } from '../../utils/formatCurrency';

interface ClearancePrintTemplateProps {
  member: Anggota | null;
  summary: SettlementSummary | null;
}

export const ClearancePrintTemplate = forwardRef<HTMLDivElement, ClearancePrintTemplateProps>(
  ({ member, summary }, ref) => {
    if (!member || !summary) return null;

    const printDate = new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return (
      <div 
        ref={ref} 
        id="printable-settlement" 
        className="p-2 bg-white text-black print:w-full print:text-black print:p-0"
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: 215mm 330mm; /* Standar Ukuran Kertas F4 / Folio Indonesia */
              margin: 8mm 12mm 8mm 12mm;
            }
            body {
              background: #fff !important;
              color: #000 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            /* Sembunyikan elemen non-print saat pencetakan */
            body > * {
              visibility: hidden;
            }
            aside, header, nav, .print\\:hidden {
              display: none !important;
            }
            main {
              padding: 0 !important;
              margin: 0 !important;
              max-width: none !important;
            }
            #printable-settlement, #printable-settlement * {
              visibility: visible !important;
            }
            #printable-settlement {
              display: block !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
            }
          }
        `}} />

        {/* Header Kop Koperasi */}
        <div className="text-center mb-3 border-b-2 border-black pb-2">
          <h1 className="text-xl font-bold uppercase tracking-wider">KOPERASI SIMKOP</h1>
          <p className="text-xs">Jln. Koperasi No. 1, Jakarta Selatan</p>
          <h2 className="text-base font-bold mt-2 underline">SURAT KETERANGAN KLIRING HAK ANGGOTA</h2>
        </div>

        {/* Identitas Anggota */}
        <div className="mb-2 text-xs">
          <p>Pada hari ini, {printDate}, menerangkan bahwa anggota di bawah ini:</p>
          <table className="mt-1">
            <tbody>
              <tr>
                <td className="w-32 font-semibold py-0.5">Nama</td>
                <td className="py-0.5">: {member.nama}</td>
              </tr>
              <tr>
                <td className="w-32 font-semibold py-0.5">NRP</td>
                <td className="py-0.5">: {member.nrp}</td>
              </tr>
              <tr>
                <td className="w-32 font-semibold py-0.5">Status</td>
                <td className="py-0.5">: Mengundurkan Diri (Keluar)</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tabel A: Hak Simpanan */}
        <div className="mb-2">
          <h3 className="font-bold border-b border-gray-400 mb-1 text-xs">A. HAK SIMPANAN ANGGOTA</h3>
          <table className="w-full text-xs mb-1 border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 py-1 px-2 text-left">Jenis Simpanan</th>
                <th className="border border-gray-300 py-1 px-2 text-right">Saldo Hak</th>
              </tr>
            </thead>
            <tbody>
              {summary.deposit_details.map((d, idx) => (
                <tr key={idx}>
                  <td className="border border-gray-300 py-1 px-2">{d.deposit_name} {d.can_be_withdrawn ? '(Bisa Ditarik Harian)' : '(Wajib/Pokok)'}</td>
                  <td className="border border-gray-300 py-1 px-2 text-right">{formatCurrency(d.total_amount)}</td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-50">
                <td className="border border-gray-300 py-1 px-2 text-right">Total Hak Simpanan</td>
                <td className="border border-gray-300 py-1 px-2 text-right">{formatCurrency(summary.total_hak)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tabel B: Kewajiban Pinjaman */}
        <div className="mb-2">
          <h3 className="font-bold border-b border-gray-400 mb-1 text-xs">B. KEWAJIBAN PINJAMAN ANGGOTA</h3>
          <table className="w-full text-xs mb-1 border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 py-1 px-2 text-left">No. / Peruntukan</th>
                <th className="border border-gray-300 py-1 px-2 text-right">Plafon</th>
                <th className="border border-gray-300 py-1 px-2 text-right">Sudah Dibayar</th>
                <th className="border border-gray-300 py-1 px-2 text-right">Sisa Kewajiban</th>
              </tr>
            </thead>
            <tbody>
              {summary.loan_details.length === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-gray-300 py-1.5 px-2 text-center italic text-gray-500">Tidak ada kewajiban pinjaman aktif.</td>
                </tr>
              ) : (
                summary.loan_details.map((l, idx) => (
                  <tr key={idx}>
                    <td className="border border-gray-300 py-1 px-2">{l.loan_number || '-'} / {l.purpose}</td>
                    <td className="border border-gray-300 py-1 px-2 text-right">{formatCurrency(Math.max(0, Math.abs(l.principal_amount)))}</td>
                    <td className="border border-gray-300 py-1 px-2 text-right">{formatCurrency(Math.max(0, Math.abs(l.total_paid)))}</td>
                    <td className="border border-gray-300 py-1 px-2 text-right">{formatCurrency(Math.max(0, Math.abs(l.remaining_balance)))}</td>
                  </tr>
                ))
              )}
              <tr className="font-bold bg-gray-50">
                <td colSpan={3} className="border border-gray-300 py-1 px-2 text-right">Total Sisa Kewajiban</td>
                <td className="border border-gray-300 py-1 px-2 text-right">{formatCurrency(Math.abs(summary.total_kewajiban))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Blok C: Net Settlement */}
        <div className="mb-3">
          <h3 className="font-bold border-b border-gray-400 mb-1 text-xs">C. PERHITUNGAN BERSIH (NET SETTLEMENT)</h3>
          <div className="p-2.5 border border-black font-bold text-sm flex justify-between bg-gray-50">
            <span>{summary.net_settlement >= 0 ? 'Hak Bersih Anggota (Surplus):' : 'Kekurangan Pembayaran Anggota (Defisit):'}</span>
            <span className={summary.net_settlement >= 0 ? 'text-blue-900' : 'text-red-700'}>{formatCurrency(summary.net_settlement)}</span>
          </div>
          {summary.net_settlement < 0 && (
            <p className="text-xs italic mt-1 font-semibold text-red-700">
              * Anggota wajib menyetorkan kekurangan sebesar {formatCurrency(Math.abs(summary.net_settlement))} sebelum disahkan.
            </p>
          )}
          {summary.net_settlement >= 0 && (
            <p className="text-xs italic mt-1 text-gray-700">
              * Dana bersih ({formatCurrency(summary.net_settlement)}) akan ditransfer ke rekening terdaftar anggota / diserahkan secara tunai.
            </p>
          )}
        </div>

        {/* Blok Tanda Tangan */}
        <div className="mt-4 print:mt-4 text-xs break-inside-avoid print:break-inside-avoid">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="mb-10 print:mb-10">Pemohon (Anggota),</p>
              <p className="font-bold underline">{member.nama}</p>
              <p>NRP: {member.nrp}</p>
            </div>
            <div>
              <p className="mb-10 print:mb-10">Petugas Simpan Pinjam,</p>
              <p className="font-bold underline">_______________________</p>
            </div>
            <div>
              <p className="mb-10 print:mb-10">Mengetahui, Ketua Koperasi</p>
              <p className="font-bold underline">_______________________</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
ClearancePrintTemplate.displayName = 'ClearancePrintTemplate';
