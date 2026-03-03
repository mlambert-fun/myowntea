import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { api } from '@/api/client';

export default function ResetPasswordPage() {
  const location = useLocation();
  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('token') || '';
  }, [location.search]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkToken = async () => {
      if (!token) {
        if (mounted) {
          setTokenValid(false);
          setCheckingToken(false);
          setError('Lien invalide. Merci de refaire une demande de réinitialisation.');
        }
        return;
      }
      try {
        setCheckingToken(true);
        const response = await api.validateResetPasswordToken(token);
        if (!mounted) return;
        if (response.valid) {
          setTokenValid(true);
          setError(null);
        } else {
          setTokenValid(false);
          setError('Ce lien de réinitialisation est invalide ou expiré.');
        }
      } catch {
        if (!mounted) return;
        setTokenValid(false);
        setError('Impossible de vérifier le lien de réinitialisation.');
      } finally {
        if (mounted) setCheckingToken(false);
      }
    };
    checkToken();
    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="mx-auto max-w-md px-6">
          <PageBreadcrumb />
          <div className="rounded-2xl bg-white p-8 shadow">
            <h2 className="mb-2 font-display text-2xl text-[var(--sage-deep)]">Nouveau mot de passe</h2>
            <p className="mb-6 text-sm text-[var(--sage-deep)]/60">Choisissez un nouveau mot de passe sécurisé.</p>

            {checkingToken && <div className="mb-4 text-sm text-[var(--sage-deep)]/70">Vérification du lien...</div>}
            {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
            {success && (
              <div className="mb-4 rounded-xl border border-[#E5E0D5] bg-[#FBF8F2] p-3 text-sm text-[var(--sage-deep)]/80">
                {success}
              </div>
            )}

            {!checkingToken && tokenValid && !success && (
              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError(null);

                  if (newPassword.length < 8) {
                    setError('Le mot de passe doit contenir au moins 8 caractères.');
                    return;
                  }
                  if (newPassword !== confirmPassword) {
                    setError('Les mots de passe ne correspondent pas.');
                    return;
                  }

                  setLoading(true);
                  try {
                    await api.resetPassword({ token, newPassword });
                    setSuccess('Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter.');
                    setNewPassword('');
                    setConfirmPassword('');
                  } catch (requestError: any) {
                    const message = requestError?.message || 'Impossible de réinitialiser le mot de passe.';
                    setError(message);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <input
                  type="password"
                  required
                  placeholder="Nouveau mot de passe"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="input-elegant w-full"
                />
                <input
                  type="password"
                  required
                  placeholder="Confirmer le mot de passe"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="input-elegant w-full"
                />
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? 'Validation...' : 'Mettre à jour le mot de passe'}
                </button>
              </form>
            )}

            <div className="mt-4 text-xs text-[var(--sage-deep)]/60">
              Retour à la{' '}
              <button className="underline" onClick={() => (window.location.href = '/login')}>
                connexion
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
