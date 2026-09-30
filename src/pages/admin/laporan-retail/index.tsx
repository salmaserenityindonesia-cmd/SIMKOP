import React, { useState } from 'react';
import { AdminLayout } from '../../../components/layout/AdminLayout';
import { 
  FileSpreadsheet, 
  Printer, 
  RefreshCcw, 
  Calendar,
  Filter,
  TrendingUp,
  Banknotes, // wait, lucide doesn't have Banknotes, I'll use Wallet or DollarSign
  Wallet,
  CreditCard,
  Package,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Store
} from 'lucide-react';

export default function LaporanRetail() {
  const [activeTab, setActiveTab] = useState<'tutup-kasir' | 'terlaris' | 'stok'>('tutup-kasir');

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6 text-[#0F2942]">
        
        {/* Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="text-sm text-slate-500 mb-1">
              SIMKOP / Laporan / <span className="font-semibold text-slate-800">Laporan Retail & Inventori</span>
            </div>
            <h1 className="text-3xl font-semibold font-serif text-[#0F2942] flex items-center gap-2">
              <Store className="w-8 h-8 text-[#0D9488]" />
              Laporan Retail & Inventori Toko
            </h1>
            <p className="text-slate-600 mt-1 max-w-3xl">
              Konsolidasi omzet penjualan kasir, rekonsiliasi kas/simpanan anggota, analisis margin laba kotor, serta valuasi aset gudang FIFO.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-full text-sm font-medium text-[#0F2942]">
              Periode Pembukuan: September 2026
            </span>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#0B7A70] transition shadow-sm font-medium">
              <RefreshCcw className="w-4 h-4" />
              Sinkronisasi POS
            </button>
          </div>
        </div>

        {/* Top Toolbar */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-wrap gap-4 items-end shadow-sm">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Rentang Waktu</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-slate-400" />
              </div>
              <input type="text" value="28/09/2026 - 28/09/2026" readOnly className="block w-full pl-10 pr-3 py-2 border border-[#CBD5E1] rounded-lg text-sm bg-[#F8FAFC]" />
            </div>
          </div>
          
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-[#0F2942] text-white text-sm font-medium rounded-lg">Hari Ini</button>
            <button className="px-4 py-2 bg-white border border-[#CBD5E1] text-[#0F2942] text-sm font-medium rounded-lg hover:bg-slate-50">Kemarin</button>
            <button className="px-4 py-2 bg-white border border-[#CBD5E1] text-[#0F2942] text-sm font-medium rounded-lg hover:bg-slate-50">Bulan Ini</button>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Kasir</label>
            <select className="block w-full border border-[#CBD5E1] rounded-lg text-sm px-3 py-2 bg-white">
              <option>Semua Kasir</option>
              <option>Kasir 01 (Siti)</option>
              <option>Kasir 02 (Rudi)</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Kategori Produk</label>
            <select className="block w-full border border-[#CBD5E1] rounded-lg text-sm px-3 py-2 bg-white">
              <option>Semua Kategori</option>
              <option>Sembako</option>
              <option>Minuman</option>
            </select>
          </div>

          <div className="flex gap-2 ml-auto">
            <button className="flex items-center gap-2 px-4 py-2 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition font-medium shadow-sm">
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-[#CBD5E1] text-[#0F2942] rounded-lg hover:bg-slate-50 transition font-medium">
              <Printer className="w-4 h-4" />
              Cetak PDF
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="border-b border-[#CBD5E1]">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('tutup-kasir')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'tutup-kasir'
                  ? 'border-[#0D9488] text-[#0D9488]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Tutup Kasir Harian & Rekonsiliasi
            </button>
            <button
              onClick={() => setActiveTab('terlaris')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'terlaris'
                  ? 'border-[#0D9488] text-[#0D9488]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Produk Terlaris & Margin Laba
            </button>
            <button
              onClick={() => setActiveTab('stok')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'stok'
                  ? 'border-[#0D9488] text-[#0D9488]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Package className="w-4 h-4" />
              Status Stok & Valuasi Gudang
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="py-4">
          
          {/* TAB 1: TUTUP KASIR */}
          {activeTab === 'tutup-kasir' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-between">
                  <div className="text-slate-500 text-sm font-medium mb-2">Total Omzet Hari Ini</div>
                  <div className="text-3xl font-serif font-semibold text-[#0F2942]">Rp 18.450.000</div>
                  <div className="text-xs text-[#10B981] mt-2 font-medium flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> +8.4% vs kemarin
                  </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-between border-l-4 border-l-[#0D9488]">
                  <div className="text-slate-500 text-sm font-medium mb-2">Uang Tunai Kasir</div>
                  <div className="text-2xl font-semibold text-[#0F2942]">Rp 11.230.000</div>
                  <div className="text-xs text-slate-500 mt-2">Fisik laci kasir siap setoran</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-between border-l-4 border-l-[#10B981]">
                  <div className="text-slate-500 text-sm font-medium mb-2">Potong Simpanan (Sukarela)</div>
                  <div className="text-2xl font-semibold text-[#0F2942]">Rp 5.420.000</div>
                  <div className="text-xs text-slate-500 mt-2">Terdebit otomatis rekening anggota</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-between border-l-4 border-l-[#F59E0B]">
                  <div className="text-slate-500 text-sm font-medium mb-2">Bon Toko (Piutang)</div>
                  <div className="text-2xl font-semibold text-[#0F2942]">Rp 1.800.000</div>
                  <div className="text-xs text-slate-500 mt-2">Jatuh tempo potong gaji</div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <h3 className="font-semibold text-[#0F2942]">Log Transaksi Penjualan Terkini</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white text-slate-500 text-xs uppercase font-semibold border-b border-[#CBD5E1]">
                      <tr>
                        <th className="px-4 py-3">Jam</th>
                        <th className="px-4 py-3">No. Nota</th>
                        <th className="px-4 py-3">Kasir</th>
                        <th className="px-4 py-3">Pembeli</th>
                        <th className="px-4 py-3 text-right">Total Belanja</th>
                        <th className="px-4 py-3 text-right text-[#0D9488]">Tunai</th>
                        <th className="px-4 py-3 text-right text-[#10B981]">Simpanan</th>
                        <th className="px-4 py-3 text-right text-[#F59E0B]">Bon Toko</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3">16:42</td>
                        <td className="px-4 py-3 font-mono text-xs">#POS-20260928-0112</td>
                        <td className="px-4 py-3">Kasir 01</td>
                        <td className="px-4 py-3">Bambang Sutrisno (#NIA-0012)</td>
                        <td className="px-4 py-3 text-right font-medium">Rp 141.075</td>
                        <td className="px-4 py-3 text-right font-medium text-[#0D9488]">Rp 141.075</td>
                        <td className="px-4 py-3 text-right text-slate-300">-</td>
                        <td className="px-4 py-3 text-right text-slate-300">-</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-[#ECFDF5] text-[#047857] rounded text-xs font-semibold">Terposting</span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3">16:25</td>
                        <td className="px-4 py-3 font-mono text-xs">#POS-20260928-0111</td>
                        <td className="px-4 py-3">Kasir 01</td>
                        <td className="px-4 py-3">H. Ahmad Subarjo (#NIA-0142)</td>
                        <td className="px-4 py-3 text-right font-medium">Rp 385.000</td>
                        <td className="px-4 py-3 text-right text-slate-300">-</td>
                        <td className="px-4 py-3 text-right font-medium text-[#10B981]">Rp 385.000</td>
                        <td className="px-4 py-3 text-right text-slate-300">-</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-[#ECFDF5] text-[#047857] rounded text-xs font-semibold">Terposting</span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3">15:50</td>
                        <td className="px-4 py-3 font-mono text-xs">#POS-20260928-0110</td>
                        <td className="px-4 py-3">Kasir 02</td>
                        <td className="px-4 py-3">Kios Berkah Ibu Siti (#AG-0089)</td>
                        <td className="px-4 py-3 text-right font-medium">Rp 1.250.000</td>
                        <td className="px-4 py-3 text-right font-medium text-[#0D9488]">Rp 250.000</td>
                        <td className="px-4 py-3 text-right text-slate-300">-</td>
                        <td className="px-4 py-3 text-right font-medium text-[#F59E0B]">Rp 1.000.000</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-[#ECFDF5] text-[#047857] rounded text-xs font-semibold">Terposting</span>
                        </td>
                      </tr>
                    </tbody>
                    <tfoot className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] font-semibold">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-right">TOTAL (DUMMY DATA)</td>
                        <td className="px-4 py-3 text-right">Rp 1.776.075</td>
                        <td className="px-4 py-3 text-right text-[#0D9488]">Rp 391.075</td>
                        <td className="px-4 py-3 text-right text-[#10B981]">Rp 385.000</td>
                        <td className="px-4 py-3 text-right text-[#F59E0B]">Rp 1.000.000</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TERLARIS */}
          {activeTab === 'terlaris' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { rank: 1, name: 'Beras Ramos Premium 5kg', sold: 64, omzet: 'Rp 4.768.000', margin: '14.8%' },
                    { rank: 2, name: 'Minyak Goreng Sania 2L', sold: 58, omzet: 'Rp 1.972.000', margin: '18.2%' },
                    { rank: 3, name: 'Gula Pasir Gulaku 1kg', sold: 52, omzet: 'Rp 910.000', margin: '12.5%' },
                  ].map((item) => (
                    <div key={item.rank} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-[#0D9488] text-white text-xs font-bold px-3 py-1 rounded-bl-lg">#{item.rank} Best Seller</div>
                      <h4 className="font-semibold text-lg text-[#0F2942] pr-12">{item.name}</h4>
                      <p className="text-sm text-slate-500 mt-1">Terjual {item.sold} Pcs</p>
                      <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-end">
                        <div>
                          <div className="text-xs text-slate-500 uppercase font-semibold">Omzet</div>
                          <div className="font-semibold text-[#0F2942]">{item.omzet}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-[#10B981] uppercase font-semibold">Margin</div>
                          <div className="font-bold text-[#10B981]">{item.margin}</div>
                        </div>
                      </div>
                    </div>
                  ))}
               </div>
               
               <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <h3 className="font-semibold text-[#0F2942]">Peringkat Produk Terlaris</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white text-slate-500 text-xs uppercase font-semibold border-b border-[#CBD5E1]">
                      <tr>
                        <th className="px-4 py-3">No</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Nama Produk</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Omzet</th>
                        <th className="px-4 py-3 text-right">Modal (HPP)</th>
                        <th className="px-4 py-3 text-right text-[#0D9488]">Laba Kotor</th>
                        <th className="px-4 py-3 min-w-[150px]">Margin (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold">1</td>
                        <td className="px-4 py-3 font-mono text-xs">SKU-BRS-001</td>
                        <td className="px-4 py-3">Beras Ramos Premium 5kg</td>
                        <td className="px-4 py-3 text-right">64</td>
                        <td className="px-4 py-3 text-right">Rp 4.768.000</td>
                        <td className="px-4 py-3 text-right text-slate-500">Rp 4.062.336</td>
                        <td className="px-4 py-3 text-right font-medium text-[#0D9488]">Rp 705.664</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div className="bg-[#10B981] h-2 rounded-full" style={{ width: '14.8%' }}></div>
                            </div>
                            <span className="text-xs font-semibold text-[#10B981]">14.8%</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
               </div>
            </div>
          )}

          {/* TAB 3: STOK */}
          {activeTab === 'stok' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-between">
                    <div className="text-slate-500 text-sm font-medium mb-2">Valuasi Aset (Harga Beli HPP)</div>
                    <div className="text-3xl font-serif font-semibold text-[#0F2942]">Rp 84.620.000</div>
                    <div className="text-xs text-slate-500 mt-2">Dari total 148 SKU terdaftar</div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-between">
                    <div className="text-slate-500 text-sm font-medium mb-2">Potensi Penjualan (Harga Jual)</div>
                    <div className="text-3xl font-serif font-semibold text-[#0D9488]">Rp 98.450.000</div>
                    <div className="text-xs text-slate-500 mt-2">Proyeksi laba bruto Rp 13.830.000</div>
                  </div>
                  <div className="bg-[#FEF2F2] p-5 rounded-xl border border-[#FECACA] shadow-sm flex flex-col justify-between">
                    <div className="text-[#991B1B] text-sm font-medium mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Stok Kritis Butuh Restock
                    </div>
                    <div className="text-3xl font-serif font-semibold text-[#991B1B]">4 Item</div>
                    <div className="text-xs text-[#991B1B] mt-2">Segera terbitkan Purchase Order</div>
                  </div>
               </div>

               <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <h3 className="font-semibold text-[#0F2942]">Inventori Produk & Peringatan Stok</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white text-slate-500 text-xs uppercase font-semibold border-b border-[#CBD5E1]">
                      <tr>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Nama Produk</th>
                        <th className="px-4 py-3 text-right">Stok Fisik</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Harga Beli</th>
                        <th className="px-4 py-3 text-right">Harga Jual</th>
                        <th className="px-4 py-3 text-right">Valuasi Aset</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      <tr className="hover:bg-slate-50 bg-[#FEF2F2]/50">
                        <td className="px-4 py-3 font-mono text-xs">SKU-MYS-001</td>
                        <td className="px-4 py-3 font-semibold">Minyak Goreng Sania 2L</td>
                        <td className="px-4 py-3 text-right font-bold text-[#991B1B]">4</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-[#FEE2E2] text-[#991B1B] rounded text-xs font-semibold">Kritis (Min 10)</span>
                        </td>
                        <td className="px-4 py-3 text-right">Rp 28.500</td>
                        <td className="px-4 py-3 text-right">Rp 34.000</td>
                        <td className="px-4 py-3 text-right font-medium">Rp 114.000</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs">SKU-BRS-001</td>
                        <td className="px-4 py-3">Beras Ramos Premium 5kg</td>
                        <td className="px-4 py-3 text-right">25</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-[#ECFDF5] text-[#047857] rounded text-xs font-semibold">Aman</span>
                        </td>
                        <td className="px-4 py-3 text-right">Rp 63.474</td>
                        <td className="px-4 py-3 text-right">Rp 74.500</td>
                        <td className="px-4 py-3 text-right font-medium">Rp 1.586.850</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
               </div>
            </div>
          )}

        </div>

      </div>
    </AdminLayout>
  );
}
