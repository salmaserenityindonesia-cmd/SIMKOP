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
  const totalRutin = rows.reduce((sum, r) => sum + r.jumlah_simpanan_wajib + r.jumlah_simpanan_belanja + r.jumlah_simpanan_lebaran, 0);
  const totalPinjaman = rows.reduce((sum, r) => sum + r.jumlah_pinjaman, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
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
              <p className="text-sm text-green-600 font-medium">Simpanan Pokok (One-Time)</p>
              <p className="text-xl font-bold text-green-900">
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(totalPokok)}
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
              <p className="text-sm text-purple-600 font-medium">Simpanan Rutin (Dibagi)</p>
              <p className="text-xl font-bold text-purple-900">
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(totalRutin)}
              </p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
              <p className="text-sm text-orange-600 font-medium">Total Pinjaman Aktif</p>
              <p className="text-xl font-bold text-orange-900">
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(totalPinjaman)}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              Data Siap Migrasi ({rows.length})
            </h3>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-4 py-3">NRP / Nama</th>
                    <th className="px-4 py-3">Tgl Daftar</th>
                    <th className="px-4 py-3 text-right">Pokok</th>
                    <th className="px-4 py-3 text-right">Rutin (Bulan)</th>
                    <th className="px-4 py-3 text-right">Pinjaman (Sisa)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{row.nama}</div>
                        <div className="text-xs text-gray-500">{row.nrp}</div>
                      </td>
                      <td className="px-4 py-3">{row.tgl_awal_anggota || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">
                        {new Intl.NumberFormat('id-ID').format(row.jumlah_simpanan_pokok)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div>W: {new Intl.NumberFormat('id-ID').format(row.wajib_per_bulan)} /bln</div>
                        <div className="text-xs text-gray-500">Selama {row.n_bulan_simpanan} bln</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.jumlah_pinjaman > 0 ? (
                          <>
                            <div className="text-orange-600">{new Intl.NumberFormat('id-ID').format(row.sisa_pinjaman)}</div>
                            <div className="text-xs text-gray-500">{row.tenor} bln ({row.n_bulan_pinjaman} bln lampau)</div>
                          </>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                  {rows.length > 100 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-center text-gray-500 bg-gray-50">
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
