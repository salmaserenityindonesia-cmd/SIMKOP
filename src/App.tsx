import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/login';
import ProtectedRoute from './components/auth/ProtectedRoute';

function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Dashboard SIMKOP</h1>
      <p>Selamat datang di sistem manajemen koperasi.</p>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
}
