const configuredApiUrl =
  typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : '';

export const API_URL = configuredApiUrl ? configuredApiUrl.replace(/\/$/, '') : '';

export function isApiRequestUrl(requestUrl: string): boolean {
  try {
    const url = new URL(requestUrl, window.location.origin);
    const apiBaseUrl = new URL(API_URL || window.location.origin, window.location.origin);
    const apiBasePath = apiBaseUrl.pathname.replace(/\/$/, '');
    const apiPathPrefix = apiBasePath ? `${apiBasePath}/api/` : '/api/';

    return url.origin === apiBaseUrl.origin && url.pathname.startsWith(apiPathPrefix);
  } catch {
    return false;
  }
}
