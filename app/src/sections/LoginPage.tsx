import { useState } from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { useAuth } from '@/context/AuthContext';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';

export default function LoginPage() {
  const { customer, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  return (
    <div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="max-w-md mx-auto px-6">
          <PageBreadcrumb />
          <div className="bg-white rounded-2xl p-8 shadow">
            <h2 className="font-display text-2xl text-[var(--sage-deep)] mb-2">Connexion</h2>
            <p className="text-sm text-[var(--sage-deep)]/60 mb-6">Accédez à votre espace client.</p>

            {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                setError(null);
                try {
                  await login(email, password);
                  window.location.href = '/';
                } catch (err) {
                  setError('Identifiants invalides.');
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-elegant w-full"
              />
              <input
                type="password"
                required
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-elegant w-full"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs text-[var(--sage-deep)]/70 underline hover:text-[var(--gold-antique)]"
                  onClick={() => (window.location.href = '/forgot-password')}
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <button className="w-full btn-primary" disabled={loading}>
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>

            {!customer?.email && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `${apiBaseUrl}/auth/google/start`;
                  }}
                  className="w-full btn-secondary flex items-center justify-center gap-2"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.62l6.85-6.85C35.9 2.44 30.36 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.5 13.08 17.77 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h12.94c-.58 3.12-2.32 5.77-4.94 7.56l7.56 5.87C44.09 37.98 46.98 31.79 46.98 24.55z" />
                      <path fill="#FBBC05" d="M10.54 28.59c-.48-1.42-.76-2.94-.76-4.59s.27-3.17.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.98-6.19z" />
                      <path fill="#34A853" d="M24 48c6.36 0 11.7-2.1 15.6-5.7l-7.56-5.87c-2.1 1.41-4.79 2.25-8.04 2.25-6.23 0-11.5-3.58-13.46-8.69l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                  </span>
                  Continuer avec Google
                </button>
              </div>
            )}

            <div className="text-xs text-[var(--sage-deep)]/60 mt-4">
              Pas encore de compte ?{' '}
              <button className="underline" onClick={() => (window.location.href = '/register')}>
                Créer un compte
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
