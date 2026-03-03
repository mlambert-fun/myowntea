import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { Cart } from './Cart';

export default function CartPage() {
  return (
    <div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation hidePrimaryNav />

      <main>
        <Cart />

        <section className="max-w-5xl mx-auto px-6 mt-0 mb-6">
          <div className="bg-white rounded-2xl p-6 shadow">
            <h4 className="font-medium text-[var(--sage-deep)] mb-4">Sécurité & garanties</h4>
            <div className="grid sm:grid-cols-3 gap-4 text-sm text-[var(--sage-deep)]/80">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--cream-apothecary)] flex items-center justify-center">🔒</div>
                <div>
                  <div className="font-medium">Paiement sécurisé</div>
                  <div className="text-xs">3D Secure & chiffrement</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--cream-apothecary)] flex items-center justify-center">🚚</div>
                <div>
                  <div className="font-medium">Livraison fiable</div>
                  <div className="text-xs">Suivi et livraison soignée</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--cream-apothecary)] flex items-center justify-center">↩️</div>
                <div>
                  <div className="font-medium">Satisfait ou remboursé</div>
                  <div className="text-xs">Retours faciles sous 14 jours</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer hideMainSection hideNewsletterSection />
    </div>
  );
}
