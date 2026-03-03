import { useState } from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { api } from '@/api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="mx-auto max-w-md px-6">
          <PageBreadcrumb />
          <div className="rounded-2xl bg-white p-8 shadow">
            <h2 className="mb-2 font-display text-2xl text-[var(--sage-deep)]">Mot de passe oublié</h2>
            <p className="mb-6 text-sm text-[var(--sage-deep)]/60">
              Saisissez votre email pour recevoir un lien de réinitialisation.
            </p>

            {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
            {successMessage && (
              <div className="mb-4 rounded-xl border border-[#E5E0D5] bg-[#FBF8F2] p-3 text-sm text-[var(--sage-deep)]/80">
                {successMessage}
              </div>
            )}

            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setSuccessMessage(null);

                const normalizedEmail = email.trim();
                if (!normalizedEmail) {
                  setError('Merci de renseigner votre email.');
                  return;
                }

                setLoading(true);
                try {
                  const response = await api.forgotPassword({ email: normalizedEmail });
                  setSuccessMessage(response.message || 'Si un compte existe, un email vous a été envoyé.');
                } catch {
                  setError("Impossible d'envoyer l'email de réinitialisation pour le moment.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input-elegant w-full"
              />
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Envoi...' : 'Envoyer le lien'}
              </button>
            </form>

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
