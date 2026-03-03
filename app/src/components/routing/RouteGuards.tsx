import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { DataLoadingState } from '@/components/ui/loading-state';

const Loader = () => (
  <div className="min-h-screen flex items-center justify-center px-6">
    <DataLoadingState size="md" titleClassName="text-sm text-[var(--sage-deep)]/70" />
  </div>
);

const isAuthenticated = (email?: string | null) => Boolean(email);

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { customer, isLoading } = useAuth();

  if (isLoading) return <Loader />;
  if (isAuthenticated(customer?.email)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function PrivateRoute({ children }: { children: ReactNode }) {
  const { customer, isLoading } = useAuth();

  if (isLoading) return <Loader />;
  if (!isAuthenticated(customer?.email)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
