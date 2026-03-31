export { BlendPurchaseSelector as BlendSubscriptionCard } from './BlendPurchaseSelector';
/*
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { t } from '@/lib/i18n';
import { showToast } from '@/lib/toast';
import type { BlendFormatCode } from '@/lib/blend-format';
import { useState } from 'react';

type BlendSubscriptionCardProps = {
  sourceType: 'LISTING' | 'CUSTOM';
  listingId?: string;
  title: string;
  ingredientIds: string[];
  blendFormat: BlendFormatCode;
  basePriceCents: number;
  onOneTimePurchase: () => void | Promise<void>;
  oneTimeDisabled?: boolean;
  className?: string;
};

const INTERVAL_OPTIONS: Array<{ value: 1 | 2 | 3; key: string }> = [
  { value: 1, key: 'monthly' },
  { value: 2, key: 'every_two_months' },
  { value: 3, key: 'every_three_months' },
];

export function BlendSubscriptionCard({
  sourceType,
  listingId,
  title,
  ingredientIds,
  blendFormat,
  basePriceCents,
  onOneTimePurchase,
  oneTimeDisabled = false,
  className = '',
}: BlendSubscriptionCardProps) {
  const { customer } = useAuth();
  const [intervalCount, setIntervalCount] = useState<1 | 2 | 3>(1);
  const [purchaseMode, setPurchaseMode] = useState<'ONE_TIME' | 'SUBSCRIPTION'>('ONE_TIME');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sanitizedTitle = title.trim();
  const discountedPriceCents = Math.max(0, Math.round((basePriceCents * 90) / 100));
  const canSubscribe = sanitizedTitle.length > 0 && ingredientIds.length > 0;
  const isSubscriptionMode = purchaseMode === 'SUBSCRIPTION';

  const handleSubscribe = async () => {
    if (!customer?.email) {
      const message = t('app.components.subscriptions.blend_subscription_card.login_required');
      showToast(message, 'error');
      window.location.href = '/login';
      return;
    }

    if (!canSubscribe) {
      showToast(t('app.components.subscriptions.blend_subscription_card.creation_invalid'), 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const session = await api.checkoutBlendSubscription({
        sourceType,
        listingId,
        title: sanitizedTitle,
        ingredientIds,
        blendFormat,
        intervalCount,
        successUrl: `${window.location.origin}/account/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: window.location.href,
      });

      if (session?.url) {
        window.location.href = session.url;
        return;
      }

      showToast(t('app.components.subscriptions.blend_subscription_card.failed_session'), 'error');
    } catch (error: any) {
      showToast(error?.message || t('app.components.subscriptions.blend_subscription_card.failed_session'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (isSubscriptionMode) {
      await handleSubscribe();
      return;
    }

    await onOneTimePurchase();
  };

  const isPrimaryDisabled = isSubscriptionMode
    ? isSubmitting || !canSubscribe
    : oneTimeDisabled || isSubmitting;

  return (
    <div className={`relative overflow-hidden rounded-[2rem] border border-[#D8CCB5] bg-[linear-gradient(145deg,#1E312A_0%,#30483E_50%,#F6F0E5_180%)] p-6 text-white shadow-[0_24px_70px_rgba(26,43,37,0.18)] ${className}`}>
      <div className="absolute right-0 top-0 h-28 w-28 translate-x-8 -translate-y-8 rounded-full bg-[radial-gradient(circle,#D4B872_0%,rgba(212,184,114,0.1)_65%,transparent_72%)]" />
      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#E6D9BF]">
              {t('app.components.subscriptions.blend_subscription_card.kicker')}
            </p>
            <h3 className="mt-2 font-display text-2xl leading-tight text-[#F9F3E8]">
              {t('app.components.subscriptions.blend_subscription_card.title')}
            </h3>
          </div>
          <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-[#F9F3E8] backdrop-blur">
            -10%
          </div>
        </div>

        <p className="max-w-xl text-sm leading-6 text-white/78">
          {t('app.components.subscriptions.blend_subscription_card.description')}
        </p>

        <div className="mt-5 grid gap-3 rounded-[1.5rem] border border-white/10 bg-black/10 p-4 backdrop-blur">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#DCCCA9]">
                {t('app.components.subscriptions.blend_subscription_card.from')}
              </p>
              <p className="mt-1 font-display text-3xl text-[#F9F3E8]">
                {(discountedPriceCents / 100).toFixed(2)} €
              </p>
            </div>
            <p className="max-w-[12rem] text-right text-xs leading-5 text-white/68">
              {t('app.components.subscriptions.blend_subscription_card.shipping_note')}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {INTERVAL_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setIntervalCount(option.value)}
                className={`rounded-2xl border px-3 py-3 text-left transition ${
                  intervalCount === option.value
                    ? 'border-[#D4B872] bg-[#D4B872] text-[#24362F]'
                    : 'border-white/10 bg-white/5 text-white hover:border-[#D4B872]/50'
                }`}
              >
                <span className="block text-xs uppercase tracking-[0.18em] opacity-70">
                  {t('app.components.subscriptions.blend_subscription_card.cadence')}
                </span>
                <span className="mt-1 block text-sm font-medium">
                  {t(`app.components.subscriptions.blend_subscription_card.${option.key}`)}
                </span>
              </button>
            ))}
          </div>

          <ul className="grid gap-2 text-sm text-white/82">
            <li>{t('app.components.subscriptions.blend_subscription_card.benefit_discount')}</li>
            <li>{t('app.components.subscriptions.blend_subscription_card.benefit_creation_only')}</li>
            <li>{t('app.components.subscriptions.blend_subscription_card.benefit_address')}</li>
          </ul>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-white/68">
            {t('app.components.subscriptions.blend_subscription_card.portal_note')}
          </p>
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={isSubmitting || !canSubscribe}
            className="btn-primary inline-flex items-center justify-center !px-6 !py-3 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? t('app.components.subscriptions.blend_subscription_card.loading')
              : t('app.components.subscriptions.blend_subscription_card.cta')}
          </button>
        </div>
      </div>
    </div>
  );
}
*/
