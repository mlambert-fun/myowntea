import { CreditCard, Download, FileText, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Repeat2, Truck } from 'lucide-react';

import {
  api,
  type AccountSubscription,
  type AccountSubscriptionInvoice,
  type AccountSubscriptionPaymentMethodSummary,
} from '@/api/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataLoadingState } from '@/components/ui/loading-state';
import { StripeWordmark } from '@/components/ui/StripeWordmark';
import { t } from '@/lib/i18n';
import { DEFAULT_LOCALE_MARKET, readLocaleMarketPreference } from '@/lib/locale-market';
import { showToast } from '@/lib/toast';

type AccountStripeElement = {
  mount: (domElement: HTMLElement) => void;
  unmount?: () => void;
  destroy?: () => void;
};

type AccountStripeElementsInstance = {
  create: (type: 'payment', options?: Record<string, unknown>) => AccountStripeElement;
};

type AccountStripeInstance = {
  elements: (options: {
    clientSecret: string;
    locale?: string;
  }) => AccountStripeElementsInstance;
  confirmSetup: (options: {
    elements: AccountStripeElementsInstance;
    confirmParams: {
      return_url: string;
    };
    redirect?: 'always' | 'if_required';
  }) => Promise<{
    error?: {
      message?: string;
    };
    setupIntent?: {
      id?: string;
    };
  }>;
};

const stripePublishableKey = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim();

const resolveUiLocale = () => readLocaleMarketPreference()?.locale || DEFAULT_LOCALE_MARKET.locale;
const resolveStripeLocale = () => resolveUiLocale().toLowerCase().startsWith('en') ? 'en' : 'fr';

const loadStripeJs = async (): Promise<void> => {
  if (window.Stripe) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-stripe-js="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Stripe JS failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.setAttribute('data-stripe-js', 'true');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Stripe JS failed to load'));
    document.head.appendChild(script);
  });
};

const formatMoney = (amountCents: number, currency = 'EUR') => new Intl.NumberFormat(resolveUiLocale(), {
  style: 'currency',
  currency: String(currency || 'EUR').toUpperCase(),
}).format(Math.max(0, Number(amountCents) || 0) / 100);

const formatDate = (value?: string | null) => {
  if (!value) {
    return t('app.sections.account.account_subscriptions.not_available');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t('app.sections.account.account_subscriptions.not_available');
  }

  return new Intl.DateTimeFormat(resolveUiLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const formatCadence = (subscription: AccountSubscription) => {
  if (subscription.intervalCount <= 1) {
    return t('app.sections.account.account_subscriptions.every_month');
  }
  if (subscription.intervalCount === 2) {
    return t('app.sections.account.account_subscriptions.every_two_months');
  }
  return t('app.sections.account.account_subscriptions.every_three_months');
};

const formatStatusLabel = (status: string, keyPrefix = 'status') => {
  const normalized = String(status || '').trim().toLowerCase();
  const fallback = normalized
    ? normalized.replaceAll('_', ' ')
    : t('app.sections.account.account_subscriptions.not_available');
  return t(`app.sections.account.account_subscriptions.${keyPrefix}_${normalized}`, fallback);
};

const formatCardBrand = (brand: string) => {
  const value = String(brand || 'card').trim();
  if (!value) return 'Card';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatCardExpiry = (paymentMethod: AccountSubscriptionPaymentMethodSummary) => {
  if (!paymentMethod.expMonth || !paymentMethod.expYear) {
    return t('app.sections.account.account_subscriptions.payment_method_expiry_unknown');
  }

  const month = String(paymentMethod.expMonth).padStart(2, '0');
  const year = String(paymentMethod.expYear).slice(-2);
  return t('app.sections.account.account_subscriptions.payment_method_expiry', undefined, {
    value: `${month}/${year}`,
  });
};

const getSubscriptionShippingSelection = (subscription: AccountSubscription) => {
  const selection = subscription.snapshot?.shippingSelection;
  if (!selection || typeof selection !== 'object') {
    return null;
  }
  return selection as {
    mode?: 'HOME' | 'RELAY' | null;
    relayPoint?: {
      name?: string | null;
      city?: string | null;
    } | null;
  };
};

const getSubscriptionShippingModeLabel = (subscription: AccountSubscription) => {
  const mode = getSubscriptionShippingSelection(subscription)?.mode;
  if (mode === 'RELAY') {
    return t('app.sections.account.account_subscriptions.shipping_mode_relay');
  }
  return t('app.sections.account.account_subscriptions.shipping_mode_home');
};

const getSubscriptionDeliveryDestinationLabel = (subscription: AccountSubscription) => {
  const relayPoint = getSubscriptionShippingSelection(subscription)?.relayPoint;
  if (relayPoint?.name) {
    return relayPoint.city
      ? `${relayPoint.name} · ${relayPoint.city}`
      : relayPoint.name;
  }
  if (getSubscriptionShippingSelection(subscription)?.mode === 'RELAY') {
    return t('app.sections.account.account_subscriptions.relay_destination_fallback');
  }
  return t('app.sections.account.account_subscriptions.default_address_label');
};

const isSubscriptionOngoing = (subscription: AccountSubscription) => (
  subscription.status !== 'canceled' && subscription.status !== 'incomplete_expired'
);

const getSubscriptionFormatLabel = (subscription: AccountSubscription) => {
  const formatLabel = typeof subscription.snapshot?.blendFormatLabel === 'string'
    ? subscription.snapshot.blendFormatLabel.trim()
    : '';

  if (formatLabel) {
    return formatLabel;
  }

  return subscription.blendFormat || t('app.sections.account.account_subscriptions.not_available');
};

export default function AccountSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<AccountSubscription[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<AccountSubscriptionPaymentMethodSummary | null>(null);
  const [invoices, setInvoices] = useState<AccountSubscriptionInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionSubscriptionId, setActionSubscriptionId] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [setupIntentClientSecret, setSetupIntentClientSecret] = useState<string | null>(null);
  const [isPreparingPaymentMethod, setIsPreparingPaymentMethod] = useState(false);
  const [isSubmittingPaymentMethod, setIsSubmittingPaymentMethod] = useState(false);

  const stripeRef = useRef<AccountStripeInstance | null>(null);
  const stripeElementsRef = useRef<AccountStripeElementsInstance | null>(null);
  const paymentElementRef = useRef<AccountStripeElement | null>(null);
  const paymentContainerRef = useRef<HTMLDivElement | null>(null);
  const finalizedSetupIntentRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadAccountData = async () => {
      try {
        const [subscriptionsResponse, paymentMethodResponse, invoicesResponse] = await Promise.all([
          api.getAccountSubscriptions(),
          api.getAccountSubscriptionPaymentMethod(),
          api.getAccountSubscriptionInvoices(),
        ]);

        if (!mounted) return;

        setSubscriptions(Array.isArray(subscriptionsResponse?.subscriptions) ? subscriptionsResponse.subscriptions : []);
        setPaymentMethod(paymentMethodResponse?.paymentMethod || null);
        setInvoices(Array.isArray(invoicesResponse?.invoices) ? invoicesResponse.invoices : []);
      } catch (error: any) {
        if (!mounted) return;
        showToast(error?.message || t('app.sections.account.account_subscriptions.failed_load'), 'error');
      } finally {
        if (!mounted) return;
        setIsLoading(false);
      }
    };

    void loadAccountData();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setupIntentId = params.get('setup_intent');

    if (!setupIntentId || finalizedSetupIntentRef.current === setupIntentId) {
      return;
    }

    let mounted = true;
    finalizedSetupIntentRef.current = setupIntentId;

    api.setAccountSubscriptionDefaultPaymentMethod({ setupIntentId })
      .then((response) => {
        if (!mounted) return;
        setPaymentMethod(response?.paymentMethod || null);
        showToast(t('app.sections.account.account_subscriptions.payment_method_success'), 'success');
      })
      .catch((error: any) => {
        if (!mounted) return;
        showToast(error?.message || t('app.sections.account.account_subscriptions.payment_method_failed'), 'error');
      })
      .finally(() => {
        if (!mounted) return;
        params.delete('setup_intent');
        params.delete('setup_intent_client_secret');
        params.delete('redirect_status');
        const query = params.toString();
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isPaymentModalOpen || !setupIntentClientSecret) {
      return;
    }

    let isCancelled = false;

    const mountPaymentElement = async () => {
      try {
        setIsPreparingPaymentMethod(true);

        if (!stripePublishableKey) {
          throw new Error(t('app.lib.api_errors.stripe_publishable_key_missing'));
        }

        await loadStripeJs();
        if (isCancelled) return;

        const stripeFactory = window.Stripe as unknown as ((publishableKey: string) => AccountStripeInstance) | undefined;

        if (!stripeFactory) {
          throw new Error(t('app.sections.account.account_subscriptions.payment_method_failed'));
        }

        const stripe = stripeFactory(stripePublishableKey);
        const elements = stripe.elements({
          clientSecret: setupIntentClientSecret,
          locale: resolveStripeLocale(),
        });

        stripeRef.current = stripe;
        stripeElementsRef.current = elements;

        if (paymentContainerRef.current) {
          const paymentElement = elements.create('payment');
          paymentElement.mount(paymentContainerRef.current);
          paymentElementRef.current = paymentElement;
        }
      } catch (error: any) {
        if (!isCancelled) {
          setIsPaymentModalOpen(false);
          showToast(error?.message || t('app.sections.account.account_subscriptions.payment_method_failed'), 'error');
        }
      } finally {
        if (!isCancelled) {
          setIsPreparingPaymentMethod(false);
        }
      }
    };

    void mountPaymentElement();

    return () => {
      isCancelled = true;

      try {
        paymentElementRef.current?.unmount?.();
        paymentElementRef.current?.destroy?.();
      } catch {
        // Ignore Stripe element cleanup errors.
      }

      paymentElementRef.current = null;
      stripeElementsRef.current = null;
      stripeRef.current = null;
    };
  }, [isPaymentModalOpen, setupIntentClientSecret]);

  const activeSubscriptions = useMemo(
    () => subscriptions.filter(isSubscriptionOngoing),
    [subscriptions]
  );

  const inactiveSubscriptions = useMemo(
    () => subscriptions.filter((subscription) => !isSubscriptionOngoing(subscription)),
    [subscriptions]
  );

  const activeRecurringTotalCents = useMemo(
    () => activeSubscriptions.reduce((sum, subscription) => sum + (subscription.totalCents || 0), 0),
    [activeSubscriptions]
  );

  const nextBillingDate = useMemo(() => {
    const timestamps = activeSubscriptions
      .map((subscription) => {
        const value = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).getTime() : NaN;
        return Number.isNaN(value) ? null : value;
      })
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);

    if (timestamps.length === 0) {
      return null;
    }

    return new Date(timestamps[0]).toISOString();
  }, [activeSubscriptions]);

  const handleOpenPaymentMethodModal = async () => {
    try {
      setIsPaymentModalOpen(true);
      setSetupIntentClientSecret(null);
      setIsPreparingPaymentMethod(true);

      const response = await api.createAccountSubscriptionSetupIntent();
      if (!response?.clientSecret) {
        throw new Error(t('app.sections.account.account_subscriptions.payment_method_failed'));
      }

      setSetupIntentClientSecret(response.clientSecret);
    } catch (error: any) {
      setIsPaymentModalOpen(false);
      showToast(error?.message || t('app.sections.account.account_subscriptions.payment_method_failed'), 'error');
    } finally {
      setIsPreparingPaymentMethod(false);
    }
  };

  const handleSubmitPaymentMethod = async () => {
    if (!stripeRef.current || !stripeElementsRef.current) {
      showToast(t('app.sections.account.account_subscriptions.payment_method_failed'), 'error');
      return;
    }

    try {
      setIsSubmittingPaymentMethod(true);

      const result = await stripeRef.current.confirmSetup({
        elements: stripeElementsRef.current,
        confirmParams: {
          return_url: `${window.location.origin}/account/subscriptions`,
        },
        redirect: 'if_required',
      });

      if (result.error?.message) {
        throw new Error(result.error.message);
      }

      const setupIntentId = result.setupIntent?.id;
      if (!setupIntentId) {
        throw new Error(t('app.sections.account.account_subscriptions.payment_method_failed'));
      }

      finalizedSetupIntentRef.current = setupIntentId;
      const response = await api.setAccountSubscriptionDefaultPaymentMethod({ setupIntentId });
      setPaymentMethod(response?.paymentMethod || null);
      setIsPaymentModalOpen(false);
      setSetupIntentClientSecret(null);
      showToast(t('app.sections.account.account_subscriptions.payment_method_success'), 'success');
    } catch (error: any) {
      showToast(error?.message || t('app.sections.account.account_subscriptions.payment_method_failed'), 'error');
    } finally {
      setIsSubmittingPaymentMethod(false);
    }
  };

  const handleCancelSubscription = async (subscriptionId: string) => {
    try {
      setActionSubscriptionId(subscriptionId);
      const response = await api.cancelAccountSubscription(subscriptionId);
      const nextSubscription = response?.subscription;

      setSubscriptions((current) => current.map((subscription) => (
        subscription.id === subscriptionId && nextSubscription
          ? nextSubscription
          : subscription
      )));

      showToast(t('app.sections.account.account_subscriptions.cancel_success'), 'success');
    } catch (error: any) {
      showToast(error?.message || t('app.sections.account.account_subscriptions.failed_cancel'), 'error');
    } finally {
      setActionSubscriptionId(null);
    }
  };

  const handleReactivateSubscription = async (subscriptionId: string) => {
    try {
      setActionSubscriptionId(subscriptionId);
      const response = await api.reactivateAccountSubscription(subscriptionId);
      const nextSubscription = response?.subscription;

      setSubscriptions((current) => current.map((subscription) => (
        subscription.id === subscriptionId && nextSubscription
          ? nextSubscription
          : subscription
      )));

      showToast(t('app.sections.account.account_subscriptions.reactivate_success'), 'success');
    } catch (error: any) {
      showToast(error?.message || t('app.sections.account.account_subscriptions.failed_reactivate'), 'error');
    } finally {
      setActionSubscriptionId(null);
    }
  };

  const renderSubscriptionCard = (subscription: AccountSubscription, inactive = false) => {
    const isActing = actionSubscriptionId === subscription.id;
    const canCancel = !inactive && isSubscriptionOngoing(subscription) && !subscription.cancelAtPeriodEnd;
    const canReactivate = !inactive && subscription.cancelAtPeriodEnd;
    const notice = subscription.cancelAtPeriodEnd
      ? t('app.sections.account.account_subscriptions.cancellation_notice', undefined, {
          date: formatDate(subscription.currentPeriodEnd),
        })
      : inactive
        ? t('app.sections.account.account_subscriptions.stopped_notice')
        : getSubscriptionShippingSelection(subscription)?.mode === 'RELAY'
          ? t('app.sections.account.account_subscriptions.address_notice_relay')
          : t('app.sections.account.account_subscriptions.address_notice');

    return (
      <article key={subscription.id} className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-2xl text-[var(--sage-deep)]">
                {subscription.title || t('app.sections.account.account_subscriptions.default_title')}
              </h3>
              <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] ${
                inactive
                  ? 'bg-[#F6F2EA] text-[var(--sage-deep)]/62'
                  : 'bg-[#F3E7CF] text-[var(--gold-antique)]'
              }`}>
                {formatStatusLabel(subscription.status)}
              </span>
              <span className="rounded-full border border-[#E8DDCB] bg-[#FCFAF7] px-3 py-1 text-xs uppercase tracking-[0.14em] text-[var(--sage-deep)]/65">
                {formatCadence(subscription)}
              </span>
              <span className="rounded-full border border-[#E8DDCB] bg-[#FCFAF7] px-3 py-1 text-xs uppercase tracking-[0.14em] text-[var(--sage-deep)]/65">
                {getSubscriptionFormatLabel(subscription)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]/68">
              {t('app.sections.account.account_subscriptions.subscription_summary', undefined, {
                cadence: formatCadence(subscription),
                discount: String(subscription.discountPercent || 0),
              })}
            </p>
          </div>

          <div className="shrink-0 text-left lg:text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--sage-deep)]/48">
              {t('app.sections.account.account_subscriptions.recurring_total')}
            </p>
            <p className="mt-1 font-display text-2xl text-[var(--gold-antique)]">
              {formatMoney(subscription.totalCents, subscription.currency)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-[#FCFAF7] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage-deep)]/45">
              {t('app.sections.account.account_subscriptions.blend_price')}
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--sage-deep)]">
              {formatMoney(subscription.unitPriceCents, subscription.currency)}
            </p>
          </div>
          <div className="rounded-xl bg-[#FCFAF7] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage-deep)]/45">
              {t('app.sections.account.account_subscriptions.shipping')}
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--sage-deep)]">
              {formatMoney(subscription.shippingCents, subscription.currency)}
            </p>
          </div>
          <div className="rounded-xl bg-[#FCFAF7] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage-deep)]/45">
              {t('app.sections.account.account_subscriptions.next_billing')}
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--sage-deep)]">
              {formatDate(subscription.currentPeriodEnd)}
            </p>
          </div>
          <div className="rounded-xl bg-[#FCFAF7] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage-deep)]/45">
              {t('app.sections.account.account_subscriptions.shipping_mode')}
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--sage-deep)]">
              {getSubscriptionShippingModeLabel(subscription)}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--sage-deep)]/62">
              {getSubscriptionDeliveryDestinationLabel(subscription)}
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-[var(--sage-deep)]/70">
          {notice}
        </p>

        {(canCancel || canReactivate) && (
          <div className="mt-5 flex flex-wrap gap-3">
            {canReactivate ? (
              <button
                type="button"
                onClick={() => void handleReactivateSubscription(subscription.id)}
                disabled={isActing}
                className="btn-secondary inline-flex items-center justify-center !px-5 !py-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isActing
                  ? t('app.sections.account.account_subscriptions.reactivate_loading')
                  : t('app.sections.account.account_subscriptions.reactivate_cta')}
              </button>
            ) : null}
            {canCancel ? (
              <button
                type="button"
                onClick={() => void handleCancelSubscription(subscription.id)}
                disabled={isActing}
                className="btn-secondary inline-flex items-center justify-center !px-5 !py-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isActing
                  ? t('app.sections.account.account_subscriptions.cancel_loading')
                  : t('app.sections.account.account_subscriptions.cancel_cta')}
              </button>
            ) : null}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--gold-antique)]">
          {t('app.sections.account.account_subscriptions.kicker')}
        </p>
        <h1 className="mt-2 font-display text-3xl text-[var(--sage-deep)]">
          {t('app.sections.account.account_subscriptions.title')}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--sage-deep)]/70">
          {t('app.sections.account.account_subscriptions.description')}
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FCFAF7] px-3 py-1 text-xs font-medium text-[var(--sage-deep)]/70">
          <ShieldCheck className="size-4 text-[var(--gold-antique)]" />
          <span>{t('app.sections.account.account_subscriptions.security_badge')}</span>
          <StripeWordmark />
        </div>

        {!isLoading && subscriptions.length > 0 && (
          <div className="mt-5 grid gap-4 border-t border-[#EEE6D8] pt-5 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-[var(--cream-apothecary)] p-2 text-[var(--gold-antique)]">
                <Repeat2 className="size-4" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage-deep)]/48">
                  {t('app.sections.account.account_subscriptions.active_rituals')}
                </p>
                <p className="mt-1 font-display text-2xl text-[var(--sage-deep)]">
                  {activeSubscriptions.length}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="rounded-full bg-[var(--cream-apothecary)] p-2 text-[var(--gold-antique)]">
                <CreditCard className="size-4" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage-deep)]/48">
                  {t('app.sections.account.account_subscriptions.recurring_total')}
                </p>
                <p className="mt-1 font-display text-2xl text-[var(--gold-antique)]">
                  {formatMoney(activeRecurringTotalCents)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="rounded-full bg-[var(--cream-apothecary)] p-2 text-[var(--gold-antique)]">
                <CalendarClock className="size-4" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage-deep)]/48">
                  {t('app.sections.account.account_subscriptions.next_billing')}
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--sage-deep)]">
                  {nextBillingDate ? formatDate(nextBillingDate) : t('app.sections.account.account_subscriptions.not_available')}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {!isLoading && subscriptions.length > 0 ? (
        <section className="space-y-4">
          {activeSubscriptions.length > 0 && (
            <div className="pb-1">
              <h2 className="font-display text-2xl text-[var(--sage-deep)]">
                {t('app.sections.account.account_subscriptions.subscriptions_title')}
              </h2>
            </div>
          )}

          <div className="max-h-[42rem] space-y-4 overflow-y-auto pr-2 lg:max-h-[33rem]">
            {activeSubscriptions.map((subscription) => renderSubscriptionCard(subscription))}

            {inactiveSubscriptions.length > 0 && (
              <div className="pt-2">
                <div className="mb-4">
                  <h2 className="font-display text-2xl text-[var(--sage-deep)]">
                    {t('app.sections.account.account_subscriptions.inactive_title')}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]/68">
                    {t('app.sections.account.account_subscriptions.inactive_body')}
                  </p>
                </div>

                <div className="space-y-4">
                  {inactiveSubscriptions.map((subscription) => renderSubscriptionCard(subscription, true))}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="size-5 text-[var(--gold-antique)]" />
              <h2 className="font-display text-2xl text-[var(--sage-deep)]">
                {t('app.sections.account.account_subscriptions.delivery_preferences_title')}
              </h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sage-deep)]/68">
              {t('app.sections.account.account_subscriptions.delivery_preferences_body')}
            </p>
          </div>
          <Link
            to="/account/address"
            className="btn-secondary inline-flex items-center justify-center !border-[var(--gold-antique)] !px-5 !py-3 !text-[var(--gold-antique)] hover:!bg-[var(--cream-apothecary)] hover:!text-[var(--sage-deep)]"
          >
            {t('app.sections.account.account_subscriptions.manage_addresses_cta')}
          </Link>
        </div>
      </section>

      {isLoading ? (
        <DataLoadingState size="md" className="py-8" titleClassName="text-[var(--sage-deep)]/70" />
      ) : subscriptions.length === 0 ? (
        <div className="rounded-2xl border border-[#EEE6D8] bg-white p-8 text-center shadow">
          <h2 className="font-display text-2xl text-[var(--sage-deep)]">
            {t('app.sections.account.account_subscriptions.empty_title')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--sage-deep)]/70">
            {t('app.sections.account.account_subscriptions.empty_body')}
          </p>
          <Link to="/subscriptions" className="btn-secondary mt-5 inline-flex items-center justify-center !border-[var(--gold-antique)] !px-5 !py-3 !text-[var(--gold-antique)] hover:!bg-[var(--cream-apothecary)] hover:!text-[var(--sage-deep)]">
            {t('app.sections.account.account_subscriptions.discover_cta')}
          </Link>
        </div>
      ) : (
        <>
          <section className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
              <div className="flex flex-col gap-4 border-b border-[#EEE6D8] pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl text-[var(--sage-deep)]">
                    {t('app.sections.account.account_subscriptions.payment_method_title')}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]/68">
                    {t('app.sections.account.account_subscriptions.payment_method_body')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleOpenPaymentMethodModal()}
                  className="btn-secondary inline-flex items-center justify-center !border-[var(--gold-antique)] !px-5 !py-3 !text-[var(--gold-antique)] hover:!bg-[var(--cream-apothecary)] hover:!text-[var(--sage-deep)]"
                >
                  {paymentMethod
                    ? t('app.sections.account.account_subscriptions.payment_method_update_cta')
                    : t('app.sections.account.account_subscriptions.payment_method_add_cta')}
                </button>
              </div>

              {paymentMethod ? (
                <div className="mt-5 rounded-xl bg-[#FCFAF7] px-5 py-4">
                  <CreditCard className="size-4 text-[var(--gold-antique)]" />
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="font-display text-2xl text-[var(--sage-deep)]">
                        {formatCardBrand(paymentMethod.brand)} {'•'.repeat(4)} {paymentMethod.last4}
                      </p>
                      <p className="mt-1 text-sm text-[var(--sage-deep)]/65">
                        {formatCardExpiry(paymentMethod)}
                      </p>
                    </div>
                    <span className="rounded-full border border-[#E8DDCB] bg-white px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--gold-antique)]">
                      {t('app.sections.account.account_subscriptions.active_rituals')} {activeSubscriptions.length}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-[1.6rem] border border-dashed border-[#E2D6C1] bg-[var(--cream-apothecary)]/55 p-5 text-sm leading-6 text-[var(--sage-deep)]/70">
                  {t('app.sections.account.account_subscriptions.payment_method_empty')}
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
              <div className="border-b border-[#EEE6D8] pb-4">
                <div className="flex items-center gap-2">
                  <FileText className="size-5 text-[var(--gold-antique)]" />
                  <h2 className="font-display text-2xl text-[var(--sage-deep)]">
                    {t('app.sections.account.account_subscriptions.invoices_title')}
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]/68">
                  {t('app.sections.account.account_subscriptions.invoices_body')}
                </p>
              </div>

              {invoices.length === 0 ? (
                <p className="mt-5 rounded-[1.6rem] border border-dashed border-[#E2D6C1] bg-[var(--cream-apothecary)]/55 p-5 text-sm leading-6 text-[var(--sage-deep)]/70">
                  {t('app.sections.account.account_subscriptions.invoices_empty')}
                </p>
              ) : (
                <div className="mt-5 max-h-[16.5rem] space-y-3 overflow-y-auto pr-2 lg:max-h-[13.5rem]">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-[1.4rem] border border-[#EEE6D8] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-medium text-[var(--sage-deep)]">
                            {invoice.subscriptionTitle || t('app.sections.account.account_subscriptions.default_title')}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--sage-deep)]/48">
                            {t('app.sections.account.account_subscriptions.invoice_number', undefined, { number: invoice.number })}
                          </p>
                          <p className="mt-2 text-sm text-[var(--sage-deep)]/65">
                            {formatDate(invoice.createdAt)}
                          </p>
                        </div>

                        <div className="flex flex-col items-start gap-3 lg:items-end">
                          <span className="rounded-full bg-[var(--cream-apothecary)] px-3 py-1 text-xs uppercase tracking-[0.14em] text-[var(--gold-antique)]">
                            {formatStatusLabel(invoice.status, 'invoice_status')}
                          </span>
                          <div className="text-sm text-[var(--sage-deep)]/72 lg:text-right">
                            <p className="flex items-center gap-2 whitespace-nowrap lg:justify-end">
                              <span>{t('app.sections.account.account_subscriptions.invoice_total')}</span>
                              <span>{formatMoney(invoice.totalCents, invoice.currency)}</span>
                            </p>
                            <p className="flex items-center gap-2 whitespace-nowrap lg:justify-end">
                              <span>{t('app.sections.account.account_subscriptions.invoice_paid')}</span>
                              <span>{formatMoney(invoice.amountPaidCents, invoice.currency)}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        {invoice.invoicePdf || invoice.invoiceUrl ? (
                          <a
                            href={invoice.invoicePdf || invoice.invoiceUrl || undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary inline-flex items-center gap-2 !px-4 !py-2"
                          >
                            <Download className="size-4" />
                            <span>{t('app.sections.account.account_subscriptions.invoice_pdf')}</span>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        </>
      )}

      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="max-w-xl rounded-[2rem] border-[#E6D9C4] p-0 sm:max-w-xl">
          <div className="p-6 sm:p-8">
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-3xl text-[var(--sage-deep)]">
                {t('app.sections.account.account_subscriptions.payment_method_modal_title')}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-[var(--sage-deep)]/68">
                {t('app.sections.account.account_subscriptions.payment_method_modal_body')}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 rounded-[1.6rem] border border-[#EEE6D8] bg-[var(--cream-apothecary)]/45 p-4">
              {isPreparingPaymentMethod && !setupIntentClientSecret ? (
                <DataLoadingState size="sm" className="py-6" titleClassName="text-sm text-[var(--sage-deep)]/60" />
              ) : (
                <div ref={paymentContainerRef} />
              )}
            </div>

            <DialogFooter className="mt-6 flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsPaymentModalOpen(false)}
                disabled={isSubmittingPaymentMethod}
              >
                {t('app.sections.account.account_subscriptions.close_modal')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSubmitPaymentMethod()}
                disabled={isPreparingPaymentMethod || isSubmittingPaymentMethod || !setupIntentClientSecret}
              >
                {isSubmittingPaymentMethod
                  ? t('app.sections.account.account_subscriptions.payment_method_saving')
                  : t('app.sections.account.account_subscriptions.payment_method_save')}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


