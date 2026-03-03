import { Link } from 'react-router-dom';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />

      <main className="pt-28 pb-12">
        <section className="max-w-3xl mx-auto px-6">
          <PageBreadcrumb />
          <div className="bg-white rounded-2xl shadow p-8 sm:p-10 text-center">
            <div className="font-display text-6xl sm:text-7xl text-[var(--sage-deep)] leading-none">404</div>
            <h1 className="font-display text-3xl text-[var(--sage-deep)] mt-4">Page introuvable</h1>
            <p className="text-[var(--sage-deep)]/70 mt-3">
              Le contenu demandé n&apos;existe pas ou a été déplacé.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/" className="btn-primary w-full sm:w-auto">
                Retour à l&apos;accueil
              </Link>
              <Link to="/?scroll=creator" className="btn-secondary w-full sm:w-auto">
                Créer mon thé
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
