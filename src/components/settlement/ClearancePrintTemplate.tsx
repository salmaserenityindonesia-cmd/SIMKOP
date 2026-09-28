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
      <div ref={ref} className="p-8 bg-white text-black min-h-screen">
        <div className="text-center mb-8 border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold uppercase tracking-wider">KOPERASI SIMKOP</h1>
          <p className="text-sm">Jln. Koperasi No. 1, Jakarta Selatan</p>
          <h2 className="text-xl font-bold mt-4 underline">SURAT KETERANGAN KLIRING HAK ANGGOTA</h2>
        </div>

        <div className="mb-6 text-sm">
          <p>Pada hari ini, {printDate}, menerangkan bahwa anggota di bawah ini:</p>
          <table className="mt-2">
            <tbody>
              <tr>
                <td className="w-40 font-semibold">Nama</td>
                <td>: {member.nama}</td>
              </tr>
              <tr>
                <td className="w-40 font-semibold">NRP</td>
                <td>: {member.nrp}</td>
              </tr>
              <tr>
                <td className="w-40 font-semibold">Status</td>
                <td>: Mengundurkan Diri (Keluar)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mb-6">
          <h3 className="font-bold border-b border-gray-400 mb-2">A. HAK SIMPANAN ANGGOTA</h3>
          <table className="w-full text-sm mb-2 border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">Jenis Simpanan</th>
                <th className="border border-gray-300 p-2 text-right">Saldo Hak</th>
              </tr>
            </thead>
            <tbody>
              {summary.deposit_details.map((d, idx) => (
                <tr key={idx}>
                  <td className="border border-gray-300 p-2">{d.deposit_name} {d.can_be_withdrawn ? '(Bisa Ditarik Harian)' : '(Wajib/Pokok)'}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(d.total_amount)}</td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-50">
                <td className="border border-gray-300 p-2 text-right">Total Hak Simpanan</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(summary.total_hak)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mb-6">
          <h3 className="font-bold border-b border-gray-400 mb-2">B. KEWAJIBAN PINJAMAN ANGGOTA</h3>
          <table className="w-full text-sm mb-2 border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">No. / Peruntukan</th>
                <th className="border border-gray-300 p-2 text-right">Plafon</th>
                <th className="border border-gray-300 p-2 text-right">Sudah Dibayar</th>
                <th className="border border-gray-300 p-2 text-right">Sisa Kewajiban</th>
              </tr>
            </thead>
            <tbody>
              {summary.loan_details.length === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-gray-300 p-2 text-center italic text-gray-500">Tidak ada kewajiban pinjaman aktif.</td>
                </tr>
              ) : (
                summary.loan_details.map((l, idx) => (
                  <tr key={idx}>
                    <td className="border border-gray-300 p-2">{l.loan_number || '-'} / {l.purpose}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(l.principal_amount)}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(l.total_paid)}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(l.remaining_balance)}</td>
                  </tr>
                ))
              )}
              <tr className="font-bold bg-gray-50">
                <td colSpan={3} className="border border-gray-300 p-2 text-right">Total Sisa Kewajiban</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(summary.total_kewajiban)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mb-8">
          <h3 className="font-bold border-b border-gray-400 mb-2">C. PERHITUNGAN BERSIH (NET SETTLEMENT)</h3>
          <div className="p-4 border border-black font-bold text-lg flex justify-between bg-gray-50">
            <span>Hak Bersih Anggota:</span>
            <span>{formatCurrency(summary.net_settlement)}</span>
          </div>
          {summary.net_settlement < 0 && (
            <p className="text-sm italic mt-2 font-semibold">
              * Anggota wajib menyetorkan kekurangan sebesar {formatCurrency(Math.abs(summary.net_settlement))} sebelum disahkan.
            </p>
          )}
          {summary.net_settlement > 0 && (
            <p className="text-sm italic mt-2">
              * Dana bersih akan ditransfer ke rekening terdaftar anggota / diserahkan secara tunai.
            </p>
          )}
        </div>

        <div className="mt-16 text-sm">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="mb-16">Pemohon (Anggota),</p>
              <p className="font-bold underline">{member.nama}</p>
              <p>NRP: {member.nrp}</p>
            </div>
            <div>
              <p className="mb-16">Petugas Simpan Pinjam,</p>
              <p className="font-bold underline">_______________________</p>
            </div>
            <div>
              <p className="mb-16">Mengetahui, Ketua Koperasi</p>
              <p className="font-bold underline">_______________________</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
ClearancePrintTemplate.displayName = 'ClearancePrintTemplate';
