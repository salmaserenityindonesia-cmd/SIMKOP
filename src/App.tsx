import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/login';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import Kasir from './pages/admin/Kasir';
import DashboardSimpanan from './pages/admin/DashboardSimpanan';
import ApprovalPinjaman from './pages/admin/ApprovalPinjaman';
import DetailPinjaman from './pages/admin/DetailPinjaman';

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
              <Kasir />
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
          path="/admin/approval" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <ApprovalPinjaman />
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
