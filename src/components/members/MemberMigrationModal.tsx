import { X, AlertTriangle, CheckCircle, Upload } from 'lucide-react';
import { MemberParseResult } from '../../services/memberExcelService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  parseResult: MemberParseResult | null;
  isImporting: boolean;
}

export default function MemberMigrationModal({ isOpen, onClose, onConfirm, parseResult, isImporting }: Props) {
  if (!isOpen || !parseResult) return null;

  const { rows, errors } = parseResult;

  const totalPokok = rows.reduce((sum, r) => sum + r.jumlah_simpanan_pokok, 0);
  const totalWajib = rows.reduce((sum, r) => sum + r.jumlah_simpanan_wajib, 0);
  const totalPinjaman = rows.reduce((sum, r) => sum + r.jumlah_pinjaman, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatRupiah = (amount: number) => {
    if (!amount || amount === 0) return '-';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Pratinjau Migrasi Anggota (14 Kolom)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={isImporting}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {errors.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center text-red-700 font-semibold mb-2">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Ditemukan {errors.length} Kesalahan Format
              </div>
              <ul className="list-disc list-inside text-sm text-red-600 max-h-32 overflow-y-auto">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <p className="text-sm text-blue-600 font-medium">Total Anggota</p>
              <p className="text-2xl font-bold text-blue-900">{rows.length}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
              <p className="text-sm text-green-600 font-medium">Simpanan Pokok</p>
              <p className="text-xl font-bold text-green-900">
                {formatCurrency(totalPokok)}
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
              <p className="text-sm text-purple-600 font-medium">Total Simpanan Wajib</p>
              <p className="text-xl font-bold text-purple-900">
                {formatCurrency(totalWajib)}
              </p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
              <p className="text-sm text-orange-600 font-medium">Total Pinjaman Aktif</p>
              <p className="text-xl font-bold text-orange-900">
                {formatCurrency(totalPinjaman)}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              Data Siap Migrasi ({rows.length})
            </h3>
            <div className="overflow-x-auto border rounded-xl max-h-[55vh] shadow-xs">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50 text-gray-700 sticky top-0 z-20 shadow-xs">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 top-0 bg-gray-50 z-30 border-r border-gray-200 whitespace-nowrap">NRP / Nama</th>
                    <th className="px-4 py-3 whitespace-nowrap">Pangkat</th>
                    <th className="px-4 py-3 whitespace-nowrap">No. Rekening</th>
                    <th className="px-4 py-3 whitespace-nowrap">Tgl Awal</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Simp. Pokok</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Simp. Wajib</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Simp. Belanja</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Simp. Lebaran</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Jml Pinjaman</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Tgl Awal Pinj.</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Tenor</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Sisa Pinjaman</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.slice(0, 100).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 group">
                      <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-gray-100 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{row.nama}</div>
                        <div className="text-xs text-gray-500">{row.nrp}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {row.pangkat || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">
                        {row.bank_account_number || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {row.tgl_awal_anggota || '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600 whitespace-nowrap">
                        {formatRupiah(row.jumlah_simpanan_pokok)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-purple-600 whitespace-nowrap">
                        {formatRupiah(row.jumlah_simpanan_wajib)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                        {formatRupiah(row.jumlah_simpanan_belanja)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                        {formatRupiah(row.jumlah_simpanan_lebaran)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-orange-600 whitespace-nowrap">
                        {formatRupiah(row.jumlah_pinjaman)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 whitespace-nowrap">
                        {row.tgl_awal_pinjaman || '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 whitespace-nowrap">
                        {(row.jumlah_pinjaman > 0 || row.sisa_pinjaman > 0) && row.tenor > 0 ? `${row.tenor} bln` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-600 whitespace-nowrap">
                        {formatRupiah(row.sisa_pinjaman)}
                      </td>
                    </tr>
                  ))}
                  {rows.length > 100 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-3 text-center text-gray-500 bg-gray-50">
                        ... dan {rows.length - 100} baris lainnya
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 font-medium disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={isImporting || rows.length === 0}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-md hover:opacity-90 font-medium flex items-center disabled:opacity-50"
          >
            {isImporting ? (
              <>Tunggu Sebentar...</>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Mulai Migrasi & Sinkronisasi Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
