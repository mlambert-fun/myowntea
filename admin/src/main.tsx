import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isApiRequestUrl } from './lib/api-base';
import './index.css';
const originalFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const requestUrl =
    typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : input.toString();

  const isBackendRequest = isApiRequestUrl(requestUrl);
  const response = await originalFetch(
    input,
    isBackendRequest
      ? {
          ...init,
          credentials: 'include',
        }
      : init
  );

  const isProtectedAdminRequest =
    isBackendRequest &&
    !requestUrl.includes('/api/admin/auth/login') &&
    !requestUrl.includes('/api/admin/auth/verify');

  if (isProtectedAdminRequest && (response.status === 401 || response.status === 403)) {
    window.dispatchEvent(new Event('mot-admin-unauthorized'));
  }

  return response;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
