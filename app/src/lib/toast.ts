export type ToastType = 'success' | 'error' | 'info';

type ShowToastPayload = {
  message: string;
  type?: ToastType;
};

export function showToast(message: string, type: ToastType = 'info') {
  if (typeof window === 'undefined') return;

  const payload: ShowToastPayload = { message, type };
  window.dispatchEvent(new CustomEvent<ShowToastPayload>('show-toast', { detail: payload }));
}

