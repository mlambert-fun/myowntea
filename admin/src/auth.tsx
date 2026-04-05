import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type AdminSessionUser } from './api/client';

interface AdminAuthContextValue {
  user: AdminSessionUser | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
  setAuthenticatedUser: (user: AdminSessionUser | null) => void;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminSessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshSession() {
    setLoading(true);
    try {
      const session = await api.getAdminSession();
      setUser(session.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await api.logoutAdmin();
    } catch {
      // Keep logout resilient even if the session is already gone.
    } finally {
      setUser(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setLoading(false);
    };

    window.addEventListener('mot-admin-unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('mot-admin-unauthorized', handleUnauthorized);
    };
  }, []);

  const value = useMemo<AdminAuthContextValue>(() => ({
    user,
    loading,
    refreshSession,
    setAuthenticatedUser: setUser,
    logout,
  }), [loading, user]);

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
}
