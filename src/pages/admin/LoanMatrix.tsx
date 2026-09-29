import React, { useState, useEffect, useMemo } from 'react';
import { Search, Download, Filter, CheckCircle2, AlertCircle, XCircle, Clock, CalendarDays, TrendingUp, Eye } from 'lucide-react';
import LoanLedgerModal from '../../components/members/LoanLedgerModal';
import { getLoanMatrix, LoanMatrixSummary, LoanMatrixMember } from '../../services/loanMatrixService';
import { formatCurrency } from '../../utils/formatCurrency';
import * as ExcelJS from 'exceljs';
import AdminLayout from '../../components/layout/AdminLayout';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

export const LoanMatrix: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'UNPAID'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LoanMatrixSummary | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<{loanId: string, nrp: string, nama: string} | null>(null);

  useEffect(() => {
    fetchData();
  }, [year]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getLoanMatrix(year);
      setData(result);
    } catch (error) {
      console.error('Error fetching loan matrix', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = useMemo(() => {
    if (!data) return [];
    return data.members.filter(m => {
      const matchSearch = m.nrp.toLowerCase().includes(search.toLowerCase()) || m.nama.toLowerCase().includes(search.toLowerCase());
      const matchStatus = 
        statusFilter === 'ALL' ? true :
        statusFilter === 'ACTIVE' ? m.isLoanActive :
        statusFilter === 'UNPAID' ? Object.values(m.months).some(mo => mo.status === 'UNPAID') : true;
      
      return matchSearch && matchStatus;
    });
  }, [data, search, statusFilter]);

  // Reset page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const totalFiltered = filteredMembers.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const paginatedMembers = filteredMembers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExportExcel = async () => {
    if (!data) return;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Matriks Pinjaman ${year}`);

    worksheet.columns = [
      { header: 'NRP', key: 'nrp', width: 15 },
      { header: 'Nama', key: 'nama', width: 25 },
      { header: 'Status Pinjaman', key: 'status', width: 15 },
      ...MONTHS.map((m, i) => ({ header: m, key: `m${i+1}`, width: 15 })),
      { header: 'Kepatuhan YTD (%)', key: 'compliance', width: 20 },
    ];

    filteredMembers.forEach(m => {
      const row: any = {
        nrp: m.nrp,
        nama: m.nama,
        status: m.isLoanActive ? 'Aktif' : 'Selesai',
        compliance: m.complianceYTD.toFixed(1) + '%'
      };
      
      for(let i = 1; i <= 12; i++) {
        row[`m${i}`] = m.months[i].status;
      }
      worksheet.addRow(row);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Matriks_Pinjaman_${year}.xlsx`;
    link.click();
  };

  const getCellClasses = (status: string) => {
    switch (status) {
      case 'PAID': 
      case 'FINISHED': return 'bg-emerald-50 text-emerald-600 border-emerald-200';
      case 'PARTIAL': return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'UNPAID': return 'bg-rose-50 text-rose-600 border-rose-200';
      case 'PROJECTED': return 'bg-slate-50 text-slate-500 border-slate-200 border-dashed';
      default: return 'bg-white border-slate-100';
    }
  };

  const getCellIcon = (status: string) => {
    switch (status) {
      case 'PAID': 
      case 'FINISHED': return <CheckCircle2 className="w-5 h-5" />;
      case 'PARTIAL': return <AlertCircle className="w-5 h-5" />;
      case 'UNPAID': return <XCircle className="w-5 h-5" />;
      case 'PROJECTED': return <Clock className="w-5 h-5" />;
      default: return null;
    }
  };

  return (
    <AdminLayout>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Matriks Proyeksi & Kepatuhan Pinjaman</h1>
          <p className="text-slate-500 mt-1">SIMKOP / Simpan Pinjam / Matriks Pinjaman</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-sm">Kepatuhan YTD</h3>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {data?.complianceYTD.toFixed(1) ?? '0.0'}%
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-sm">Realisasi YTD</h3>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {formatCurrency(data?.totalCollectedYTD ?? 0)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <CalendarDays className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-sm">Proyeksi Bulan Depan</h3>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {formatCurrency(data?.projectedNextMonth ?? 0)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <XCircle className="w-5 h-5 text-rose-600" />
            <h3 className="font-semibold text-sm">Anggota Menunggak</h3>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {data?.unpaidMembersCount ?? 0}
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex gap-4 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Cari NRP atau Nama..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select 
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Pinjaman Aktif</option>
              <option value="UNPAID">Ada Tunggakan</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Tahun:</span>
          <select 
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-300 rounded-lg py-2 px-3 font-semibold focus:ring-2 focus:ring-emerald-500"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-3 sticky left-0 bg-slate-50 z-30 min-w-[250px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Anggota</th>
                {MONTHS.map(m => (
                  <th key={m} className="px-4 py-3 text-center min-w-[100px] border-l border-slate-200">{m}</th>
                ))}
                <th className="px-4 py-3 text-center border-l border-slate-200">Kepatuhan YTD</th>
                <th className="px-4 py-3 text-center sticky right-0 bg-slate-50 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] z-30">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-slate-500">Memuat data matriks...</td>
                </tr>
              ) : paginatedMembers.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-slate-500">Tidak ada data untuk tahun {year}</td>
                </tr>
              ) : (
                paginatedMembers.map(member => (
                  <tr key={member.memberId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="font-semibold text-slate-800">{member.nama}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                        <span>{member.nrp}</span>
                        {member.isLoanActive ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium">Aktif</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-medium">Selesai</span>
                        )}
                      </div>
                    </td>
                    
                    {Array.from({length: 12}, (_, i) => i + 1).map(m => {
                      const cell = member.months[m];
                      return (
                        <td key={m} className={`px-2 py-2 border-l border-slate-100 text-center relative group`}>
                          {cell.status !== 'NONE' ? (
                            <div className={`w-10 h-10 mx-auto rounded-lg border flex items-center justify-center cursor-help transition-all ${getCellClasses(cell.status)}`}>
                              {getCellIcon(cell.status)}
                              
                              {/* Tooltip */}
                              <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl z-50 transition-all">
                                <div className="font-semibold mb-1 border-b border-slate-600 pb-1">
                                  No: {cell.loanNumber}
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className="text-slate-300">Status:</span>
                                  <span>{cell.status}</span>
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className="text-slate-300">Tenor:</span>
                                  <span>{cell.periodNumber} / {cell.tenor}</span>
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className="text-slate-300">Target:</span>
                                  <span>{formatCurrency(cell.targetAmount)}</span>
                                </div>
                                <div className="flex justify-between mt-1 text-emerald-400">
                                  <span>Terbayar:</span>
                                  <span>{formatCurrency(cell.paidAmount)}</span>
                                </div>
                                
                                {/* Pointer arrow */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-800"></div>
                              </div>
                            </div>
                          ) : (
                            <div className="w-10 h-10 mx-auto rounded-lg border border-transparent flex items-center justify-center">
                              <span className="text-slate-300">-</span>
                            </div>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-3 border-l border-slate-100 bg-white group-hover:bg-slate-50 text-center">
                      <div className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${
                        member.complianceYTD >= 100 ? 'bg-emerald-100 text-emerald-700' :
                        member.complianceYTD >= 50 ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {member.complianceYTD.toFixed(0)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 sticky right-0 bg-white group-hover:bg-slate-50 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] text-center">
                      {(() => {
                        const loanId = Object.values(member.months).find(m => m.loanId)?.loanId;
                        return loanId ? (
                          <button 
                            onClick={() => setSelectedLoan({ loanId, nrp: member.nrp, nama: member.nama })}
                            className="inline-flex p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Lihat Buku Bantu Angsuran"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm mt-4">
        <div className="flex items-center gap-2 text-slate-500">
          <span>
            Menampilkan {totalFiltered === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
            {Math.min(currentPage * itemsPerPage, totalFiltered)} dari {totalFiltered} anggota
          </span>
          <select 
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="ml-2 bg-transparent border-none font-medium text-slate-700 outline-none cursor-pointer focus:ring-0"
          >
            <option value={10}>10 / halaman</option>
            <option value={25}>25 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>
          <span className="text-sm font-medium px-2 text-slate-700">
            {currentPage} / {totalPages || 1}
          </span>
          <button 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {selectedLoan && (
        <LoanLedgerModal
          loanId={selectedLoan.loanId}
          memberNrp={selectedLoan.nrp}
          memberName={selectedLoan.nama}
          onClose={() => setSelectedLoan(null)}
        />
      )}
    </div>
    </AdminLayout>
  );
};
