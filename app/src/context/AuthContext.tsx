import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, type CustomerProfile } from '@/api/client';

interface AuthContextValue {
  user: CustomerProfile | null;
  customer: CustomerProfile | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    email: string;
    password: string;
    salutation?: 'MME' | 'MR' | null;
    firstName?: string;
    lastName?: string;
    birthDate?: string | null;
    phoneE164?: string | null;
  }) => Promise<void>;
  logout: () => Promise<void>;
  ensureGuestSession: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const GUEST_STORAGE_KEY = 'mot_guest_customer_id';

  const getStoredGuestId = () => {
    try {
      return localStorage.getItem(GUEST_STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const setStoredGuestId = (id?: string | null) => {
    try {
      if (id) {
        localStorage.setItem(GUEST_STORAGE_KEY, id);
      }
    } catch {
      // ignore storage errors
    }
  };

  const loadMe = useCallback(async () => {
    try {
      const meResponse = await api.getMe();
      setCustomer(meResponse.customer || null);
    } catch (error) {
      setCustomer(null);
      try {
        const guestResponse = await api.createGuestSession({ guestCustomerId: getStoredGuestId() });
        setStoredGuestId(guestResponse?.guestCustomerId || guestResponse?.customer?.id || null);
        const meResponse = await api.getMe();
        setCustomer(meResponse.customer || null);
      } catch {
        // ignore guest session errors
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    await api.login({ email, password });
    await loadMe();
  }, [loadMe]);

  const register = useCallback(async (payload: {
    email: string;
    password: string;
    salutation?: 'MME' | 'MR' | null;
    firstName?: string;
    lastName?: string;
    birthDate?: string | null;
    phoneE164?: string | null;
  }) => {
    await api.register(payload);
    await loadMe();
  }, [loadMe]);

  const logout = useCallback(async () => {
    await api.logout();
    setCustomer(null);
  }, []);

  const ensureGuestSession = useCallback(async () => {
    if (customer?.id) return;
    const response = await api.createGuestSession({ guestCustomerId: getStoredGuestId() });
    setStoredGuestId(response?.guestCustomerId || response?.customer?.id || null);
    await loadMe();
  }, [customer?.id, loadMe]);

  return (
    <AuthContext.Provider value={{ user: customer, customer, isLoading, login, register, logout, ensureGuestSession, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
