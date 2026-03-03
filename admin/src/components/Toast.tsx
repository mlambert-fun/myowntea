import { useEffect, useState } from 'react';

type ToastItem = {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
};

export function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ message?: string; type?: ToastItem['type'] }>;
      const payload = custom.detail;
      const message = String(payload?.message || '').trim();
      if (!message) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toast: ToastItem = { id, message, type: payload?.type || 'info' };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3500);
    };

    window.addEventListener('show-toast', handler as EventListener);
    return () => window.removeEventListener('show-toast', handler as EventListener);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '1.5rem',
        right: '1.5rem',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        maxWidth: '22rem',
      }}
    >
      {toasts.map((toast) => {
        const styleByType =
          toast.type === 'success'
            ? { background: '#2f7d5c', color: '#fff', borderColor: 'rgba(47, 125, 92, 0.5)' }
            : toast.type === 'error'
              ? { background: '#b42318', color: '#fff', borderColor: 'rgba(180, 35, 24, 0.5)' }
              : { background: '#243127', color: '#fff', borderColor: 'rgba(36, 49, 39, 0.5)' };

        return (
          <div
            key={toast.id}
            className="admin-alert"
            style={{
              ...styleByType,
              borderWidth: 1,
              borderStyle: 'solid',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.18)',
            }}
          >
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}

export default Toast;

