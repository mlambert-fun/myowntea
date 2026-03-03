import { useEffect, useState } from 'react';

type ToastItem = { id: string; message: string; type?: 'success' | 'error' | 'info' };

export function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<ToastItem>;
      const payload = custom.detail;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toast: ToastItem = { id, message: payload.message, type: payload.type || 'info' };
      setToasts((t) => [...t, toast]);
      setTimeout(() => {
        setToasts((t) => t.filter(x => x.id !== id));
      }, 3500);
    };

    window.addEventListener('show-toast', handler as EventListener);
    return () => window.removeEventListener('show-toast', handler as EventListener);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed z-50 top-6 right-6 flex flex-col gap-3 max-w-sm">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-md shadow-lg text-sm text-white ${t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-gray-800'}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default Toast;
