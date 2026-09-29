import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/login';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import POSPage from './pages/pos';
import DashboardSimpanan from './pages/admin/DashboardSimpanan';
import ApprovalPinjaman from './pages/admin/ApprovalPinjaman';
import PengajuanPinjaman from './pages/admin/PengajuanPinjaman';
import DetailPinjaman from './pages/admin/DetailPinjaman';
import ManajemenProduk from './pages/admin/ManajemenProduk';
import ManajemenPembelian from './pages/admin/ManajemenPembelian';
import ManajemenKategori from './pages/admin/ManajemenKategori';
import ManajemenAnggota from './pages/admin/ManajemenAnggota';
import ManajemenProdukSimpanPinjam from './pages/admin/ManajemenProdukSimpanPinjam';
import TerimaSetoran from './pages/admin/TerimaSetoran';
import PenarikanSimpanan from './pages/admin/penarikan-simpanan';
import SalaryImport from './pages/admin/SalaryImport';
import SettlementClearance from './pages/admin/SettlementClearance';
import ComplianceMatrix from './pages/admin/ComplianceMatrix';
import { LoanMatrix } from './pages/admin/LoanMatrix';
import BatchUpdater from './pages/admin/BatchUpdater';
import LaporanKeuangan from './pages/admin/laporan-keuangan';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        {/* Admin Route */}
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/users" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <UserManagement />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/kasir" 
          element={
            <ProtectedRoute>
              <POSPage />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/simpanan" 
          element={
            <ProtectedRoute>
              <DashboardSimpanan />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/setoran" 
          element={
            <ProtectedRoute>
              <TerimaSetoran />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/penarikan-simpanan" 
          element={
            <ProtectedRoute>
              <PenarikanSimpanan />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/pengajuan-pinjaman" 
          element={
            <ProtectedRoute>
              <PengajuanPinjaman />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/admin/approval" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <ApprovalPinjaman />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/admin/master-simpan-pinjam" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <ManajemenProdukSimpanPinjam />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/admin/pinjaman/:id" 
          element={
            <ProtectedRoute>
              <DetailPinjaman />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/produk" 
          element={
            <ProtectedRoute>
              <ManajemenProduk />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/admin/kategori" 
          element={
            <ProtectedRoute>
              <ManajemenKategori />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/pembelian" 
          element={
            <ProtectedRoute>
              <ManajemenPembelian />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/anggota" 
          element={
            <ProtectedRoute>
              <ManajemenAnggota />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/admin/import-gaji" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <SalaryImport />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/admin/clearance" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <SettlementClearance />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/compliance-matrix" 
          element={
            <ProtectedRoute>
              <ComplianceMatrix />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/loan-matrix" 
          element={
            <ProtectedRoute>
              <LoanMatrix />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/batch-update" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <BatchUpdater />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/laporan-keuangan" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <LaporanKeuangan />
            </ProtectedRoute>
          } 
        />
        
        {/* Fallback routing */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              {/* Redirect to admin if they are logged in, later we can add roles check here if needed */}
              <Navigate to="/admin" replace />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
}
