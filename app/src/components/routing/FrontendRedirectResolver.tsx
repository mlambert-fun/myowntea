import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { getRedirectGeoContext } from '@/lib/locale-market';

const REDIRECT_SEED_KEY = 'mot_redirect_seed';

const getOrCreateRedirectSeed = () => {
  const existing = localStorage.getItem(REDIRECT_SEED_KEY);
  if (existing && existing.trim().length > 0) return existing;
  const next = `seed-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  localStorage.setItem(REDIRECT_SEED_KEY, next);
  return next;
};

const toComparablePath = (value: string) => {
  if (!value) return '/';
  try {
    const url = new URL(value, window.location.origin);
    const path = `${url.pathname || '/'}${url.search || ''}`;
    return path || '/';
  } catch {
    return value;
  }
};

export function FrontendRedirectResolver() {
  const location = useLocation();
  const navigate = useNavigate();
  const lastTransitionRef = useRef<{ signature: string; at: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const currentPath = `${location.pathname}${location.search}`;
    if (currentPath.startsWith('/maintenance')) {
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      try {
        const redirectContext = getRedirectGeoContext();
        if (currentPath === '/' && !redirectContext.hasPreference) {
          return;
        }

        const seed = getOrCreateRedirectSeed();
        const decision = await api.resolveRedirect({
          path: currentPath,
          locale: redirectContext.locale || undefined,
          countryCode: redirectContext.countryCode || undefined,
          seed,
        });

        if (cancelled || !decision?.matched || !decision.targetPath) return;

        const targetPath = decision.targetPath;
        if (/^https?:\/\//i.test(targetPath)) {
          window.location.assign(targetPath);
          return;
        }

        const normalizedCurrent = toComparablePath(currentPath);
        const normalizedTarget = toComparablePath(targetPath);
        if (!normalizedTarget || normalizedTarget === normalizedCurrent) return;

        const signature = `${normalizedCurrent}->${normalizedTarget}`;
        const now = Date.now();
        if (
          lastTransitionRef.current &&
          lastTransitionRef.current.signature === signature &&
          now - lastTransitionRef.current.at < 1500
        ) {
          return;
        }

        lastTransitionRef.current = { signature, at: now };
        navigate(targetPath, { replace: true });
      } catch {
        // Silent fail: navigation should continue even if resolver is unavailable.
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate]);

  return null;
}
