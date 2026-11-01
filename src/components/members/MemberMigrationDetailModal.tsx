import React, { useEffect, useState } from 'react';
import { X, UserCheck, Wallet, Banknote, Calendar, CheckCircle2, AlertCircle, Loader2, Info, Building2, CreditCard } from 'lucide-react';
import { Anggota } from '../../services/koperasiService';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/formatCurrency';

interface MemberMigrationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Anggota | null;
}

export interface SimpananSnapshot {
  pokok: number;
  wajib: number;
  belanja: number;
  lebaran: number;
  total: number;
}

/**
 * Ekstraksi saldo mutlak snapshot migrasi simpanan awal anggota:
 * Memprioritaskan mutasi migrasi terbaru (berdasarkan urutan created_at / id paling baru)
 * alih-alih menjumlahkannya, agar nilai yang diambil adalah nilai mutasi tunggal terkini
 * dan tahan terhadap riwayat lama / re-import berulang (misal Pokok Joko Ramadhan tetap Rp 10.000).
 */
export function extractMigrationDeposits(memberDepositsData: any[]): SimpananSnapshot {
  let pokok = 0;
  let wajib = 0;
  let belanja = 0;
  let lebaran = 0;

  if (memberDepositsData && Array.isArray(memberDepositsData)) {
    for (const md of memberDepositsData) {
      const typeObj = Array.isArray(md.deposit_types) ? md.deposit_types[0] : md.deposit_types;
      const typeName = (typeObj?.name || '').toLowerCase();
      const typeCode = (typeObj?.code || '').toLowerCase();
      const txs = (md.deposit_transactions as any[]) || [];

      // Filter transaksi yang berhubungan dengan migrasi / saldo awal
      const migrationTxs = txs.filter((t: any) => {
        const desc = (t.description || '').toLowerCase();
        return (
          desc.includes('migra') ||
          desc.includes('migration') ||
          desc.includes('saldo awal') ||
          desc.includes('historical') ||
          desc.includes('one-time')
        );
      });

      // Tentukan nilai nominal saldo migrasi:
      // Jika ada beberapa mutasi migrasi lama yang tertinggal di database karena re-import berulang sebelumnya,
      // prioritaskan mutasi migrasi terbaru (berdasarkan created_at / id terbaru) alih-alih menjumlahkannya,
      // agar nilai yang diambil adalah nilai mutasi tunggal terkini.
      let amount = 0;
      if (migrationTxs.length > 0) {
        migrationTxs.sort((a: any, b: any) => {
          const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
          if (!isNaN(timeB) && !isNaN(timeA) && timeB !== timeA) {
            return timeB - timeA;
          }
          return String(b.id || '').localeCompare(String(a.id || ''));
        });
        amount = Math.abs(Number(migrationTxs[0].amount || 0));
      } else if (txs.length > 0) {
        txs.sort((a: any, b: any) => {
          const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
          if (!isNaN(timeB) && !isNaN(timeA) && timeB !== timeA) {
            return timeB - timeA;
          }
          return String(b.id || '').localeCompare(String(a.id || ''));
        });
        amount = Math.abs(Number(txs[0].amount || 0));
      }

      if (typeName.includes('pokok') || typeCode.includes('pokok')) {
        pokok = Math.max(pokok, amount);
      } else if (typeName.includes('wajib') || typeCode.includes('wajib')) {
        wajib = Math.max(wajib, amount);
      } else if (typeName.includes('belanja') || typeCode.includes('belanja')) {
        belanja = Math.max(belanja, amount);
      } else if (typeName.includes('lebaran') || typeName.includes('hari raya') || typeCode.includes('lebaran')) {
        lebaran = Math.max(lebaran, amount);
      }
    }
  }

  return {
    pokok,
    wajib,
    belanja,
    lebaran,
    total: pokok + wajib + belanja + lebaran
  };
}

interface MigrationLoanDetail {
  id: string;
  loanNumber: string;
  principalAmount: number;
  tenor: number;
  startDateDisplay: string;
  totalPaid: number;
  remainingAmount: number;
  status: string;
  notes?: string;
}

export default function MemberMigrationDetailModal({
  isOpen,
  onClose,
  member
}: MemberMigrationDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [simpanan, setSimpanan] = useState<SimpananSnapshot>({
    pokok: 0,
    wajib: 0,
    belanja: 0,
    lebaran: 0,
    total: 0
  });
  const [migrationLoan, setMigrationLoan] = useState<MigrationLoanDetail | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !member?.id) {
      setSimpanan({ pokok: 0, wajib: 0, belanja: 0, lebaran: 0, total: 0 });
      setMigrationLoan(null);
      return;
    }

    let isMounted = true;

    async function fetchMigrationDetails() {
      setLoading(true);
      try {
        // 1. Fetch deposit accounts and initial migration deposit transactions
        const { data: memberDepositsData, error: mdErr } = await supabase
          .from('member_deposits')
          .select(`
            id,
            deposit_types (
              id,
              name,
              code
            ),
            deposit_transactions (
              id,
              amount,
              transaction_type,
              description,
              created_at,
              for_month,
              for_year
            )
          `)
          .eq('member_id', member!.id);

        if (mdErr) {
          console.warn('Gagal memuat deposit_transactions untuk member:', mdErr.message);
        }

        const depositSnapshot = extractMigrationDeposits(memberDepositsData || []);

        // 2. Fetch migration loan from loans table
        const { data: loanData, error: loanErr } = await supabase
          .from('loans')
          .select(`
            id,
            loan_number,
            notes,
            amount,
            principal_amount,
            tenor,
            agreed_tenor_months,
            disbursed_at,
            created_at,
            status,
            loan_repayments (
              id,
              amount_paid,
              payment_date
            ),
            loan_schedules (
              id,
              period_number,
              target_amount,
              paid_amount,
              status
            )
          `)
          .eq('member_id', member!.id)
          .order('created_at', { ascending: false });

        if (loanErr) {
          console.warn('Gagal memuat loans untuk member:', loanErr.message);
        }

        let parsedLoan: MigrationLoanDetail | null = null;
        if (loanData && loanData.length > 0) {
          // Cari pinjaman migrasi spesifik (LOAN-MIG atau mengandung catatan migrasi)
          const migLoan = loanData.find((l: any) => 
            (l.loan_number && l.loan_number.startsWith('LOAN-MIG')) ||
            (l.notes && l.notes.toLowerCase().includes('migrasi'))
          ) || loanData[0]; // fallback ke pinjaman pertama jika anggota hanya punya 1 pinjaman

          if (migLoan && (Number(migLoan.principal_amount || migLoan.amount || 0) > 0)) {
            const principal = Number(migLoan.principal_amount || migLoan.amount || 0);
            const tenor = Number(migLoan.agreed_tenor_months || migLoan.tenor || 1);

            // Ekstrak teks tanggal / siklus awal dari notes migrasi jika ada
            let startDateDisplay = '-';
            const notesText = migLoan.notes || '';
            const cycleMatch = notesText.match(/Nilai asli tgl\/siklus Excel:\s*"?([^"\)]+)"?/i);

            if (cycleMatch && cycleMatch[1]) {
              startDateDisplay = `${cycleMatch[1].trim()} (Siklus Excel)`;
            } else if (migLoan.disbursed_at) {
              const d = new Date(migLoan.disbursed_at);
              if (!isNaN(d.getTime())) {
                startDateDisplay = d.toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                });
              }
            } else if (migLoan.created_at) {
              const d = new Date(migLoan.created_at);
              if (!isNaN(d.getTime())) {
                startDateDisplay = d.toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                });
              }
            }

            // Hitung akumulasi yang sudah diangsur
            const reps = (migLoan.loan_repayments as any[]) || [];
            const scheds = (migLoan.loan_schedules as any[]) || [];
            const paidFromReps = reps.reduce((sum: number, r: any) => sum + Number(r.amount_paid || 0), 0);
            const paidFromScheds = scheds.reduce((sum: number, s: any) => sum + Number(s.paid_amount || 0), 0);
            const totalPaid = Math.max(paidFromReps, paidFromScheds);
            const remaining = Math.max(0, principal - totalPaid);

            parsedLoan = {
              id: migLoan.id,
              loanNumber: migLoan.loan_number || 'LOAN-MIG',
              principalAmount: principal,
              tenor: tenor,
              startDateDisplay,
              totalPaid,
              remainingAmount: remaining,
              status: migLoan.status || 'active',
              notes: migLoan.notes || undefined
            };
          }
        }

        if (isMounted) {
          setSimpanan(depositSnapshot);
          setMigrationLoan(parsedLoan);
        }
      } catch (err) {
        console.error('Error saat mengambil detail migrasi anggota:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchMigrationDetails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, member?.id]);

  if (!isOpen || !member) return null;

  // Format tanggal terdaftar
  const tglTerdaftar = member.created_at
    ? new Date(member.created_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : '-';

  // Badge status keanggotaan
  const membershipStatus = member.membership_status || member.status || 'ACTIVE';
  const isStatusActive = membershipStatus.toUpperCase() === 'ACTIVE' || membershipStatus.toLowerCase() === 'aktif';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 text-blue-400 rounded-xl border border-blue-500/30">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Rincian Data Migrasi Awal Anggota
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  14 Kolom Snapshot
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-2">
                <span className="font-mono font-medium text-amber-300">NRP: {member.nrp}</span>
                <span>•</span>
                <span className="font-semibold text-slate-100">{member.nama}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/60">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="w-9 h-9 animate-spin text-blue-600" />
              <p className="text-sm font-medium text-slate-600">
                Memuat rincian data saldo dan pinjaman migrasi awal...
              </p>
            </div>
          ) : (
            <>
              {/* Card 1: Profil & Kepegawaian */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                    Card 1: Profil & Kepegawaian
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs font-medium text-slate-500 mb-0.5">NRP</span>
                    <span className="font-mono font-semibold text-slate-800">{member.nrp}</span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs font-medium text-slate-500 mb-0.5">Nama Lengkap</span>
                    <span className="font-semibold text-slate-800">{member.nama}</span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs font-medium text-slate-500 mb-0.5">Pangkat / Golongan</span>
                    <span className="font-medium text-slate-800">{member.pangkat || '-'}</span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs font-medium text-slate-500 mb-0.5">No. Rekening Bank</span>
                    <span className="font-mono text-slate-800">{member.bank_account_number || '-'}</span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs font-medium text-slate-500 mb-0.5">Status Keanggotaan</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        isStatusActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {membershipStatus}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs font-medium text-slate-500 mb-0.5">Tanggal Terdaftar / Tgl Awal</span>
                    <span className="font-medium text-slate-800">{tglTerdaftar}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Simpanan Awal Migrasi */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                      Card 2: Simpanan Awal Migrasi
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    Saldo As-Is Lampau
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                    <span className="block text-xs font-medium text-emerald-700 mb-1">Simpanan Pokok</span>
                    <span className="text-base font-bold text-slate-800">
                      {formatCurrency(simpanan.pokok)}
                    </span>
                  </div>

                  <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                    <span className="block text-xs font-medium text-blue-700 mb-1">Simpanan Wajib (Utuh)</span>
                    <span className="text-base font-bold text-slate-800">
                      {formatCurrency(simpanan.wajib)}
                    </span>
                  </div>

                  <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-100">
                    <span className="block text-xs font-medium text-purple-700 mb-1">Simpanan Belanja</span>
                    <span className="text-base font-bold text-slate-800">
                      {formatCurrency(simpanan.belanja)}
                    </span>
                  </div>

                  <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                    <span className="block text-xs font-medium text-amber-700 mb-1">Simpanan Lebaran</span>
                    <span className="text-base font-bold text-slate-800">
                      {formatCurrency(simpanan.lebaran)}
                    </span>
                  </div>
                </div>

                {/* Total Akumulasi Simpanan Awal */}
                <div className="mt-4 p-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl flex items-center justify-between shadow-xs">
                  <div>
                    <span className="text-xs font-medium text-emerald-100 block">
                      Total Akumulasi Simpanan Awal
                    </span>
                    <span className="text-xs text-emerald-200">
                      (Pokok + Wajib + Belanja + Lebaran)
                    </span>
                  </div>
                  <span className="text-xl font-extrabold tracking-tight">
                    {formatCurrency(simpanan.total)}
                  </span>
                </div>
              </div>

              {/* Card 3: Pinjaman Bawaan Migrasi */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                      Card 3: Pinjaman Bawaan Migrasi
                    </h3>
                  </div>
                  {migrationLoan && (
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {migrationLoan.loanNumber}
                    </span>
                  )}
                </div>

                {migrationLoan ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="block text-xs font-medium text-slate-500 mb-0.5">
                          Plafon Pinjaman Pokok
                        </span>
                        <span className="text-base font-bold text-slate-800">
                          {formatCurrency(migrationLoan.principalAmount)}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="block text-xs font-medium text-slate-500 mb-0.5">
                          Tgl / Siklus Awal
                        </span>
                        <span className="text-sm font-medium text-slate-800">
                          {migrationLoan.startDateDisplay}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="block text-xs font-medium text-slate-500 mb-0.5">
                          Tenor Pinjaman
                        </span>
                        <span className="text-sm font-semibold text-slate-800">
                          {migrationLoan.tenor} Bulan
                        </span>
                      </div>

                      <div className="bg-indigo-50/70 p-3 rounded-lg border border-indigo-200">
                        <span className="block text-xs font-bold text-indigo-700 mb-0.5">
                          Sisa Pokok Pinjaman
                        </span>
                        <span className="text-base font-extrabold text-indigo-900">
                          {formatCurrency(migrationLoan.remainingAmount)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Sudah Diangsur:</span>
                        <span className="font-semibold text-emerald-700">
                          {formatCurrency(migrationLoan.totalPaid)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Status Pinjaman:</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 uppercase">
                          {migrationLoan.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-emerald-50/40 border border-emerald-100 rounded-xl flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-full">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-1">
                        Tidak Memiliki Pinjaman Bawaan Migrasi
                      </span>
                      <p className="text-xs text-slate-600">
                        Anggota ini terdaftar bersih tanpa catatan kewajiban pinjaman lampau saat proses migrasi awal dilakukan.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-white border-t border-slate-200 gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span>Data ini merupakan catatan historis snapshot migrasi anggota (14 Kolom Template).</span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-semibold cursor-pointer shadow-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
