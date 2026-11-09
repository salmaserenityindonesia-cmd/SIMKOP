import { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Upload, Loader2, Info, Eye } from 'lucide-react';
import { MemberParseResult } from '../../services/memberExcelService';
import { TierRate, computeReverseWajibBreakdown, ReverseWajibBreakdownResult } from '../../utils/memberMigrationParser';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  parseResult: MemberParseResult | null;
  isImporting: boolean;
  importProgress?: { current: number; total: number } | null;
  wajibRateTiers?: TierRate[];
}

export default function MemberMigrationModal({
  isOpen,
  onClose,
  onConfirm,
  parseResult,
  isImporting,
  importProgress,
  wajibRateTiers = [],
}: Props) {
  const [selectedInspection, setSelectedInspection] = useState<{
    nama: string;
    nrp: string;
    tgl_awal_anggota: string | null;
    breakdown: ReverseWajibBreakdownResult;
  } | null>(null);

  if (!isOpen || !parseResult) return null;

  const { rows, errors } = parseResult;

  // Hitung evaluasi selisih untuk seluruh baris anggota
  const rowBreakdowns = rows.map(r => ({
    row: r,
    breakdown: computeReverseWajibBreakdown(r.tgl_awal_anggota, r.jumlah_simpanan_wajib, wajibRateTiers),
  }));

  const countWithDifference = rowBreakdowns.filter(b => b.breakdown.hasDifference).length;
  const countPre2020 = rowBreakdowns.filter(b => b.breakdown.isPre2020Member).length;
  const countBalanced = rowBreakdowns.filter(b => !b.breakdown.hasDifference && !b.breakdown.isPre2020Member).length;

  const totalPokok = rows.reduce((sum, r) => sum + r.jumlah_simpanan_pokok, 0);
  const totalWajib = rows.reduce((sum, r) => sum + r.jumlah_simpanan_wajib, 0);
  const totalPinjaman = rows.reduce((sum, r) => sum + r.jumlah_pinjaman, 0);
  const totalSisaPinjaman = rows.reduce((sum, r) => sum + r.sisa_pinjaman, 0);
  const totalAnggotaPinjaman = rows.filter(r => r.jumlah_pinjaman > 0 || r.sisa_pinjaman > 0).length;

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

  const getMonthName = (m: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return months[m - 1] || String(m);
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

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-600 font-medium">Total Anggota</p>
              <p className="text-xl font-bold text-blue-900">{rows.length}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
              <p className="text-xs text-green-600 font-medium">Simpanan Pokok</p>
              <p className="text-base font-bold text-green-900">
                {formatCurrency(totalPokok)}
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
              <p className="text-xs text-purple-600 font-medium">Total Simpanan Wajib</p>
              <p className="text-base font-bold text-purple-900">
                {formatCurrency(totalWajib)}
              </p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
              <p className="text-xs text-orange-600 font-medium">Total Pinjaman Aktif</p>
              <p className="text-base font-bold text-orange-900">
                {formatCurrency(totalPinjaman)}
              </p>
            </div>
            <div className="bg-rose-50 p-4 rounded-lg border border-rose-100">
              <p className="text-xs text-rose-600 font-medium">Sisa Hutang / Baki Piutang</p>
              <p className="text-base font-bold text-rose-900">
                {formatCurrency(totalSisaPinjaman)}
              </p>
            </div>
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-600 font-medium">Anggota dg Pinjaman</p>
              <p className="text-xl font-bold text-amber-900">{totalAnggotaPinjaman}</p>
            </div>
          </div>

          {/* Audit Rekonsiliasi Tarif Bertingkat Simpanan Wajib */}
          <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-slate-500" />
              Audit Tarif Bertingkat Simpanan Wajib:
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
              Seimbang: {countBalanced}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-medium">
              Historis Pra-2020: {countPre2020}
            </span>
            {countWithDifference > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold animate-pulse">
                Terdapat Selisih: {countWithDifference} anggota
              </span>
            )}
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
                  {rowBreakdowns.slice(0, 100).map(({ row, breakdown }, i) => (
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
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{formatRupiah(row.jumlah_simpanan_wajib)}</span>
                            {breakdown.monthsCount > 0 && (
                              <button
                                type="button"
                                title="Lihat rincian penguraian bulanan"
                                onClick={() => setSelectedInspection({
                                  nama: row.nama,
                                  nrp: row.nrp,
                                  tgl_awal_anggota: row.tgl_awal_anggota,
                                  breakdown,
                                })}
                                className="p-1 rounded text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Badge Peringatan Selisih / Info Historis */}
                          {breakdown.isPre2020Member && (
                            <span className="text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded mt-1 text-right">
                              Pra-2020: Utuh {formatRupiah(breakdown.pre2020LumpSum)} + {breakdown.monthsCount} bln
                            </span>
                          )}

                          {breakdown.hasDifference && (
                            <div className="flex flex-col items-end gap-0.5 mt-1 text-right">
                              <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                Selisih: {breakdown.difference > 0 ? '+' : ''}{formatRupiah(breakdown.difference)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                (Ekspektasi sistem {breakdown.monthsCount} bln: {formatRupiah(breakdown.calculatedTotal)})
                              </span>
                            </div>
                          )}

                          {!breakdown.hasDifference && !breakdown.isPre2020Member && breakdown.monthsCount > 0 && (
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded mt-1 text-right">
                              Seimbang ({breakdown.monthsCount} bln)
                            </span>
                          )}
                        </div>
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

        {isImporting && importProgress && (
          <div className="px-6 py-4 bg-blue-50 border-t border-blue-200">
            <div className="flex justify-between items-center text-sm font-semibold text-blue-900 mb-2">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                Memproses: {importProgress.current} / {importProgress.total} anggota...
              </span>
              <span>
                {importProgress.total > 0
                  ? Math.round((importProgress.current / importProgress.total) * 100)
                  : 0}%
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    importProgress.total > 0
                      ? Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

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
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {importProgress && importProgress.total > 0
                  ? `Memproses (${Math.round((importProgress.current / importProgress.total) * 100)}%)...`
                  : 'Tunggu Sebentar...'}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Mulai Migrasi & Sinkronisasi Data
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal / Dialog Inspeksi Rincian Uraian Mundur */}
      {selectedInspection && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-60 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h4 className="font-bold text-sm">Rincian Penguraian Simpanan Wajib</h4>
                <p className="text-xs text-slate-300">{selectedInspection.nama} ({selectedInspection.nrp})</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInspection(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500">Tgl Awal Anggota:</span>
                  <p className="font-semibold text-slate-800">{selectedInspection.tgl_awal_anggota || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Nominal di Excel:</span>
                  <p className="font-bold text-purple-700">{formatRupiah(selectedInspection.breakdown.excelWajibAmount)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Ekspektasi Uraian:</span>
                  <p className="font-semibold text-slate-800">
                    {formatRupiah(selectedInspection.breakdown.calculatedTotal)} ({selectedInspection.breakdown.monthsCount} bulan)
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Status Selisih:</span>
                  <p className={`font-bold ${selectedInspection.breakdown.hasDifference ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {selectedInspection.breakdown.hasDifference
                      ? `${selectedInspection.breakdown.difference > 0 ? '+' : ''}${formatRupiah(selectedInspection.breakdown.difference)}`
                      : 'Seimbang (0)'}
                  </p>
                </div>
              </div>

              {selectedInspection.breakdown.isPre2020Member && (
                <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-900 flex items-start gap-2">
                  <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Anggota Pra-2020:</span> Periode sebelum Jan 2020 tidak diurai bulanan. Sisa saldo historis dicatat utuh sebesar <span className="font-bold">{formatRupiah(selectedInspection.breakdown.pre2020LumpSum)}</span>.
                  </div>
                </div>
              )}

              <div>
                <h5 className="text-xs font-semibold text-slate-700 mb-2">
                  Uraian Bulan Mundur ({selectedInspection.breakdown.monthlyBreakdown.length} Bulan):
                </h5>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 font-semibold">No</th>
                        <th className="px-3 py-1.5 font-semibold">Periode Bulan</th>
                        <th className="px-3 py-1.5 font-semibold text-right">Tarif Berlaku</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedInspection.breakdown.monthlyBreakdown.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-medium text-slate-800">
                            {getMonthName(item.month)} {item.year}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold text-purple-700">
                            {formatRupiah(item.amount)}
                          </td>
                        </tr>
                      ))}
                      {selectedInspection.breakdown.monthlyBreakdown.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-slate-400">
                            Tidak ada penguraian bulanan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedInspection(null)}
                className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
