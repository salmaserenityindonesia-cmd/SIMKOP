import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

interface ProtectedAuthState {
  isAuthenticated: boolean;
  isAdmin: boolean;
  canAccessPos: boolean;
  canAccessOpname: boolean;
  opnameOnlyLogin: boolean;
  authError?: string;
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requirePosAccess = false,
  requireOpnameAccess = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requirePosAccess?: boolean;
  requireOpnameAccess?: boolean;
}) {
  const [authState, setAuthState] = useState<ProtectedAuthState | null>(null);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    async function resolveSession(session: any) {
      if (!session) {
        if (mounted) {
          setAuthState((prev) => ({
            isAuthenticated: false,
            isAdmin: false,
            canAccessPos: false,
            canAccessOpname: false,
            opnameOnlyLogin: false,
            authError: prev?.authError,
          }));
        }
        return;
      }

      let isAdmin = session.user.app_metadata?.role === 'admin';
      let canAccessPos = true;
      let canAccessOpname = true;
      let opnameOnlyLogin = false;

      if (session.user?.id) {
        try {
          let { data: pengelola, error: pengelolaErr } = await supabase
            .from('pengelola')
            .select('role, is_active, can_access_pos, can_access_opname, opname_only_login')
            .eq('id', session.user.id)
            .maybeSingle();

          if (pengelolaErr) {
            // Fallback if is_active column has not been migrated yet
            const fallbackRes = await supabase
              .from('pengelola')
              .select('role, can_access_pos, can_access_opname, opname_only_login')
              .eq('id', session.user.id)
              .maybeSingle();
            pengelola = fallbackRes.data as any;
          }

          if (pengelola) {
            if ((pengelola as any).is_active === false) {
              await supabase.auth.signOut();
              if (mounted) {
                setAuthState({
                  isAuthenticated: false,
                  isAdmin: false,
                  canAccessPos: false,
                  canAccessOpname: false,
                  opnameOnlyLogin: false,
                  authError: 'Akun Anda telah dinonaktifkan oleh Admin.',
                });
              }
              return;
            }
            if (pengelola.role === 'admin') {
              isAdmin = true;
            }
            canAccessPos = pengelola.can_access_pos !== false;
            canAccessOpname = pengelola.can_access_opname !== false;
            opnameOnlyLogin = Boolean(pengelola.opname_only_login);
          }
        } catch {
          // Keep safe defaults if query fails
        }
      }

      if (mounted) {
        setAuthState({
          isAuthenticated: true,
          isAdmin,
          canAccessPos,
          canAccessOpname,
          opnameOnlyLogin,
        });
      }
    }

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      resolveSession(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (authState === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin h-8 w-8 text-primary border-4 border-t-transparent rounded-full"></div>
      </div>
    ); // Loading state
  }

  if (!authState.isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location, authError: authState.authError }}
        replace
      />
    );
  }

  const defaultOperatorRoute =
    (!authState.canAccessPos || authState.opnameOnlyLogin) && authState.canAccessOpname
      ? '/operator/stock-opname'
      : '/admin/kasir';

  if (requireAdmin && !authState.isAdmin) {
    // Redirect to non-admin dashboard or unauthorized page
    return <Navigate to={defaultOperatorRoute} replace />;
  }

  const allowPosSwitch = Boolean(
    (location.state as { allowPosSwitch?: boolean } | null)?.allowPosSwitch
  );

  if (requirePosAccess && !authState.isAdmin) {
    if (!authState.canAccessPos) {
      return <Navigate to="/operator/stock-opname" replace />;
    }
    if (authState.opnameOnlyLogin && !allowPosSwitch) {
      return <Navigate to="/operator/stock-opname" replace />;
    }
  }

  if (requireOpnameAccess && !authState.isAdmin && !authState.canAccessOpname) {
    return <Navigate to="/admin/kasir" replace />;
  }

  return <>{children}</>;
}
