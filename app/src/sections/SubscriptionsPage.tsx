import { useEffect, useState } from 'react';
import { api, type SubscriptionPlan } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { DataLoadingState } from '@/components/ui/loading-state';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { showToast } from '@/lib/toast';

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
  const [planRequiresAuth, setPlanRequiresAuth] = useState<Record<string, boolean>>({});
  const { customer } = useAuth();

  useEffect(() => {
    let mounted = true;
    api.getSubscriptionPlans()
      .then((data) => {
        if (!mounted) return;
        setPlans(Array.isArray(data) ? data : []);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="min-h-screen bg-[#FAF8F3] pt-28 pb-16">
      <div className="max-w-5xl mx-auto px-6">
        <PageBreadcrumb />
        <div className="flex flex-col gap-2 mb-10">
          <h1 className="font-display text-4xl text-[var(--sage-deep)]">Abonnements</h1>
          <p className="text-[var(--sage-deep)]/70 max-w-2xl">
            Recevez vos créations favorites chaque mois, sans y penser. Choisissez votre formule et profitez d’une infusion continue.
          </p>
        </div>

        {loading ? (
          <DataLoadingState
            size="md"
            className="py-8"
            title="Chargement des abonnements..."
            titleClassName="text-[var(--sage-deep)]/70"
          />
        ) : plans.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-[var(--sage-deep)]/70">Aucun abonnement disponible pour le moment.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {plans.map((plan) => (
              <div key={plan.id} className="bg-white rounded-2xl shadow p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-[var(--sage-deep)] text-lg">{plan.product?.title || 'Abonnement'}</h3>
                    <p className="text-sm text-[var(--sage-deep)]/70">
                      Facturation tous les {plan.intervalCount} {plan.interval === 'month' ? 'mois' : plan.interval}.
                    </p>
                  </div>
                  <span className="font-display text-2xl text-[var(--gold-antique)]">
                    {((plan.product?.priceCents || 0) / 100).toFixed(2)} €
                  </span>
                </div>
                {plan.product?.description && (
                  <p className="text-sm text-[var(--sage-deep)]/70">{plan.product.description}</p>
                )}
                <button
                  className="btn-primary w-full"
                  onClick={async () => {
                    setPlanErrors((prev) => {
                      if (!prev[plan.id]) return prev;
                      const next = { ...prev };
                      delete next[plan.id];
                      return next;
                    });
                    setPlanRequiresAuth((prev) => ({ ...prev, [plan.id]: false }));

                    if (!customer?.id) {
                      const message = 'Veuillez vous connecter pour souscrire.';
                      setPlanErrors((prev) => ({ ...prev, [plan.id]: message }));
                      setPlanRequiresAuth((prev) => ({ ...prev, [plan.id]: true }));
                      showToast(message, 'error');
                      return;
                    }
                    try {
                      setActivePlanId(plan.id);
                      const session = await api.checkoutSubscription({ planId: plan.id });
                      if (session?.url) {
                        window.location.href = session.url;
                        return;
                      }
                      const fallbackMessage = 'Impossible de créer la session d’abonnement.';
                      setPlanErrors((prev) => ({ ...prev, [plan.id]: fallbackMessage }));
                      showToast(fallbackMessage, 'error');
                    } catch (e: any) {
                      const message = e?.message || 'Impossible de créer la session d’abonnement.';
                      setPlanErrors((prev) => ({ ...prev, [plan.id]: message }));
                      showToast(message, 'error');
                    } finally {
                      setActivePlanId((prev) => (prev === plan.id ? null : prev));
                    }
                  }}
                  disabled={activePlanId === plan.id}
                >
                  S’abonner
                </button>
                {planErrors[plan.id] && (
                  <div className="text-xs text-red-600" role="alert">
                    {planErrors[plan.id]}
                    {planRequiresAuth[plan.id] && (
                      <a href="/login" className="ml-1 text-[var(--gold-antique)] hover:underline">
                        Se connecter
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
