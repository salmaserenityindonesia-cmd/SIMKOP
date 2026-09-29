import { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { Search, Download, Send, CheckCircle2, FileSpreadsheet, AlertTriangle, Eye } from 'lucide-react';
import { getComplianceMatrixData, ComplianceMatrixRow, ComplianceMonthData } from '../../services/matrixService';
import MemberLedgerModal from '../../components/members/MemberLedgerModal';
import { supabase } from '../../lib/supabaseClient';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const CURRENT_MONTH = new Date().getMonth();

export default function ComplianceMatrix() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  
  const [data, setData] = useState<ComplianceMatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<{id: string, nrp: string, nama: string} | null>(null);
  const [totalSetoran, setTotalSetoran] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const matrixData = await getComplianceMatrixData(parseInt(year));
        setData(matrixData);
        
        // Fetch total setoran
        const { data: txs } = await supabase
          .from('deposit_transactions')
          .select('amount, transaction_type')
          .eq('for_year', parseInt(year));
          
        let sum = 0;
        if (txs) {
           txs.forEach((tx: any) => {
              if (tx.transaction_type === 'deposit') sum += Number(tx.amount);
              else if (tx.transaction_type === 'withdrawal') sum -= Number(tx.amount);
           });
        }
        setTotalSetoran(sum);
      } catch (err) {
        console.error('Failed to fetch compliance matrix', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [year]);

  const filteredData = data.filter(row => 
    row.nama.toLowerCase().includes(search.toLowerCase()) || 
    row.nrp.includes(search)
  );

  const ytdCompliance = data.length > 0 
    ? (data.reduce((acc, row) => acc + row.compliance, 0) / data.length).toFixed(1)
    : '100';

  const membersInArrears = data.filter(row => {
    // Only check arrears if the current year matches the selected year, or if we want to show arrears for the selected year's current month?
    // We'll check the CURRENT_MONTH of the selected year if we assume they might owe in the past, but the prompt says "Bulan Ini"
    // Let's use CURRENT_MONTH data.
    const currentMonthData = row.months[CURRENT_MONTH];
    if (currentMonthData && (!currentMonthData.w || !currentMonthData.b || !currentMonthData.l)) {
      return true;
    }
    return false;
  }).length;

  const renderCell = (monthData: ComplianceMonthData | null, monthIndex: number) => {
    if (!monthData) return <div className="text-gray-300 text-xs text-center">-</div>;
    
    const { w, b, l } = monthData;
    const allPaid = w && b && l;
    const unpaidCount = (!w ? 1 : 0) + (!b ? 1 : 0) + (!l ? 1 : 0);

    return (
      <div className="relative group flex justify-center items-center w-full h-full">
        {allPaid ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        ) : (
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-50 text-red-600 text-xs font-bold border border-red-200">
            {unpaidCount}
          </div>
        )}

        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-3 pointer-events-none">
          <div className="font-semibold mb-2 text-slate-200 border-b border-slate-600 pb-1">{MONTHS[monthIndex]} {year}</div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span>Wajib:</span>
              {w ? <span className="text-emerald-400">Rp 25.000 (Lunas)</span> : <span className="text-red-400 font-medium">Belum</span>}
            </div>
            <div className="flex justify-between items-center">
              <span>Belanja:</span>
              {b ? <span className="text-emerald-400">Rp 50.000 (Lunas)</span> : <span className="text-red-400 font-medium">Belum</span>}
            </div>
            <div className="flex justify-between items-center">
              <span>Lebaran:</span>
              {l ? <span className="text-emerald-400">Rp 50.000 (Lunas)</span> : <span className="text-red-400 font-medium">Belum</span>}
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <span>SIMKOP</span> <span className="text-slate-300">/</span>
            <span>Simpan Pinjam</span> <span className="text-slate-300">/</span>
            <span className="text-slate-700 font-medium">Matriks Pembayaran</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Matriks Tracking Pembayaran Simpanan Tahunan</h1>
          <p className="text-slate-500 mt-1">Monitoring kepatuhan dan histori pembayaran simpanan seluruh anggota per bulan pada tahun berjalan.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Tingkat Kepatuhan (YTD)</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">{ytdCompliance}%</h3>
            </div>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${ytdCompliance}%` }}></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Setoran Terkumpul ({year})</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">Rp {totalSetoran.toLocaleString('id-ID')}</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-emerald-600 font-medium flex items-center mt-2">
            <span className="mr-1">Real-time update</span> dari database
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Anggota Menunggak Bulan Ini</p>
              <h3 className="text-2xl font-bold text-red-600 mt-1">{membersInArrears} Orang</h3>
            </div>
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <button className="text-xs text-red-600 hover:text-red-700 font-medium text-left mt-2 underline underline-offset-2">
            Lihat daftar anggota
          </button>
        </div>
      </div>

      {/* Control Toolbar */}
      <div className="bg-white rounded-t-xl border border-slate-200 p-4 flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <select 
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          >
            <option value="2026">Tahun 2026</option>
            <option value="2025">Tahun 2025</option>
          </select>

          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          >
            <option value="all">Semua Jenis Simpanan</option>
            <option value="wajib">Simpanan Wajib</option>
            <option value="belanja">Simpanan Belanja Bulanan</option>
            <option value="lebaran">Simpanan Hari Raya</option>
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari NRP / Nama Anggota..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
          <button className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
            <Download className="w-4 h-4 mr-2" />
            Export Rekap Excel
          </button>
          <button className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            <Send className="w-4 h-4 mr-2" />
            Kirim Pengingat
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border-x border-slate-200 overflow-hidden relative w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse min-w-[1200px]">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="sticky left-0 bg-slate-50 z-10 py-3 px-4 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[280px]">
                  Informasi Anggota
                </th>
                {MONTHS.map((month, idx) => (
                  <th key={month} className={`py-3 px-2 border-b border-slate-200 text-center min-w-[60px] ${idx === CURRENT_MONTH ? 'bg-emerald-50/50 border-x-2 border-x-emerald-200/50' : ''}`}>
                    {month}
                  </th>
                ))}
                <th className="sticky right-0 bg-slate-50 z-10 py-3 px-4 border-b border-l border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[160px] text-center">
                  Kepatuhan & Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      <p>Memuat data matriks...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-slate-500">
                    Tidak ada data anggota ditemukan.
                  </td>
                </tr>
              ) : filteredData.map((row) => (
                <tr key={row.nrp} className="hover:bg-slate-50/50 transition-colors group/row">
                  <td className="sticky left-0 bg-white group-hover/row:bg-slate-50/90 z-10 py-3 px-4 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800">{row.nama}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{row.nrp}</span>
                        {row.pokokLunas ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium border border-emerald-200">Pokok: Lunas</span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium border border-amber-200">Pokok: Belum</span>
                        )}
                      </div>
                    </div>
                  </td>
                  
                  {row.months.map((month, idx) => (
                    <td key={idx} className={`py-3 px-1 border-b border-slate-100 align-middle ${idx === CURRENT_MONTH ? 'bg-emerald-50/20 border-x-2 border-x-emerald-100/50' : ''}`}>
                      {renderCell(month, idx)}
                    </td>
                  ))}

                  <td className="sticky right-0 bg-white group-hover/row:bg-slate-50/90 z-10 py-3 px-4 border-b border-l border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium text-slate-600">{row.compliance}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full ${row.compliance >= 90 ? 'bg-emerald-500' : row.compliance >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} 
                            style={{ width: `${row.compliance}%` }}
                          ></div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedMember({ id: row.member_id, nrp: row.nrp, nama: row.nama })}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Buku Pembantu">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer / Legend */}
      <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-slate-600">Lunas Lengkap</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold border border-red-200">
              1
            </div>
            <span className="text-slate-600">Ada Tunggakan</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-gray-300 text-lg leading-none">-</div>
            <span className="text-slate-600">Belum Terbit Tagihan</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-500">
          <span>Menampilkan 1-3 dari 120 anggota</span>
          <select className="ml-2 bg-transparent border-none font-medium text-slate-700 outline-none cursor-pointer">
            <option>10 / halaman</option>
            <option>25 / halaman</option>
            <option>50 / halaman</option>
          </select>
        </div>
      </div>

      {selectedMember && (
        <MemberLedgerModal
          memberId={selectedMember.id}
          memberNrp={selectedMember.nrp}
          memberName={selectedMember.nama}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </AdminLayout>
  );
}
