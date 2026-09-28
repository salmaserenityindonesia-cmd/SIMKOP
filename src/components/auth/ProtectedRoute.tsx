import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

export default function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const [authState, setAuthState] = useState<{ isAuthenticated: boolean; isAdmin: boolean } | null>(null);
  const location = useLocation();

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const isAdmin = session.user.app_metadata?.role === 'admin';
        setAuthState({ isAuthenticated: true, isAdmin });
      } else {
        setAuthState({ isAuthenticated: false, isAdmin: false });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        const isAdmin = session.user.app_metadata?.role === 'admin';
        setAuthState({ isAuthenticated: true, isAdmin });
      } else {
        setAuthState({ isAuthenticated: false, isAdmin: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authState === null) {
    return <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="animate-spin h-8 w-8 text-primary border-4 border-t-transparent rounded-full"></div>
    </div>; // Loading state
  }

  if (!authState.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && !authState.isAdmin) {
    // Redirect to non-admin dashboard or unauthorized page
    return <Navigate to="/admin/kasir" replace />;
  }

  return <>{children}</>;
}
