import { t } from '@/lib/i18n';
import type { BlendFormatCode } from '@/lib/blend-format';
import { showToast } from '@/lib/toast';
import { useAuth } from '@/context/AuthContext';
import { Check, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

type BlendPurchaseSelectorProps = {
  sourceType: 'LISTING' | 'CUSTOM';
  listingId?: string;
  title: string;
  ingredientIds: string[];
  blendFormat: BlendFormatCode;
  basePriceCents: number;
  onOneTimePurchase: (quantity: number) => void | Promise<void>;
  onSubscriptionPurchase: (intervalCount: 1 | 2 | 3) => void | Promise<void>;
  oneTimeDisabled?: boolean;
  className?: string;
};

const INTERVAL_OPTIONS: Array<{ value: 1 | 2 | 3; key: string }> = [
  { value: 1, key: 'interval_one_month' },
  { value: 2, key: 'interval_two_months' },
  { value: 3, key: 'interval_three_months' },
];

export function BlendPurchaseSelector({
  title,
  ingredientIds,
  basePriceCents,
  onOneTimePurchase,
  onSubscriptionPurchase,
  oneTimeDisabled = false,
  className = '',
}: BlendPurchaseSelectorProps) {
  const { customer } = useAuth();
  const [intervalCount, setIntervalCount] = useState<1 | 2 | 3>(1);
  const [oneTimeQuantity, setOneTimeQuantity] = useState(1);
  const [purchaseMode, setPurchaseMode] = useState<'ONE_TIME' | 'SUBSCRIPTION'>('ONE_TIME');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sanitizedTitle = title.trim();
  const oneTimeTotalCents = Math.max(1, oneTimeQuantity) * Math.max(0, Math.round(basePriceCents));
  const discountedPriceCents = Math.max(0, Math.round((basePriceCents * 90) / 100));
  const canSubscribe = sanitizedTitle.length > 0 && ingredientIds.length > 0;
  const isSubscriptionMode = purchaseMode === 'SUBSCRIPTION';

  const handleSubscribe = async () => {
    if (!customer?.email) {
      showToast(t('app.components.subscriptions.blend_subscription_card.login_required'), 'error');
      window.location.href = '/login';
      return;
    }

    if (!canSubscribe) {
      showToast(t('app.components.subscriptions.blend_subscription_card.creation_invalid'), 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubscriptionPurchase(intervalCount);
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

    await onOneTimePurchase(oneTimeQuantity);
  };

  const isPrimaryDisabled = isSubscriptionMode
    ? isSubmitting || !canSubscribe
    : oneTimeDisabled || isSubmitting;

  return (
    <div
      className={`rounded-[2rem] border border-[#D8CCB5] bg-white p-5 shadow-[0_24px_60px_rgba(90,74,46,0.08)] ${className}`}
    >
      <div className="space-y-3">
        <div
          className={`rounded-[1.5rem] border transition ${
            !isSubscriptionMode
              ? 'border-[var(--sage-deep)] bg-[var(--cream-apothecary)]'
              : 'border-[#E5D9C4] bg-white hover:border-[var(--gold-antique)]/55'
          }`}
        >
          <button
            type="button"
            onClick={() => setPurchaseMode('ONE_TIME')}
            className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
            aria-pressed={!isSubscriptionMode}
          >
          <div className="flex items-center gap-3">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                !isSubscriptionMode ? 'border-[var(--sage-deep)]' : 'border-[var(--sage-deep)]/35'
              }`}
            >
              {!isSubscriptionMode ? <span className="h-2.5 w-2.5 rounded-full bg-[var(--sage-deep)]" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--sage-deep)]">
                {t('app.components.subscriptions.blend_subscription_card.one_time_title')}
              </p>
              <p className="mt-1 text-sm text-[var(--sage-deep)]/62">
                {t('app.components.subscriptions.blend_subscription_card.one_time_description')}
              </p>
            </div>
          </div>
          <div className="text-right whitespace-nowrap">
            <p className="text-xs uppercase tracking-[0.14em] text-transparent">
              &nbsp;
            </p>
            <p className="hidden font-display text-2xl text-[var(--sage-deep)] whitespace-nowrap">
              {(basePriceCents / 100).toFixed(2)} €
            </p>
            <p className="font-display text-2xl text-[var(--sage-deep)] whitespace-nowrap">
              {(oneTimeTotalCents / 100).toFixed(2)} {'\u20AC'}
            </p>
          </div>
          </button>

          {!isSubscriptionMode ? (
            <div className="border-t border-[var(--sage-deep)]/10 px-4 pb-4 pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[var(--sage-deep)]/68">
                  {t('app.components.subscriptions.blend_subscription_card.quantity_prompt')}
                </p>
                <div className="inline-flex items-stretch overflow-hidden rounded-2xl border border-[#D8CCB5] bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOneTimeQuantity((prev) => Math.max(1, prev - 1))}
                    className="flex h-11 w-11 items-center justify-center text-[var(--sage-deep)] transition hover:bg-[var(--cream-apothecary)] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label={t('app.components.subscriptions.blend_subscription_card.decrease_quantity')}
                    disabled={oneTimeQuantity <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="flex min-w-[4.5rem] flex-col items-center justify-center border-x border-[#E5E0D5] px-3">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--sage-deep)]/45">
                      {t('app.components.subscriptions.blend_subscription_card.quantity')}
                    </span>
                    <span className="text-sm font-medium text-[var(--sage-deep)]">{oneTimeQuantity}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOneTimeQuantity((prev) => prev + 1)}
                    className="flex h-11 w-11 items-center justify-center text-[var(--sage-deep)] transition hover:bg-[var(--cream-apothecary)]"
                    aria-label={t('app.components.subscriptions.blend_subscription_card.increase_quantity')}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={`rounded-[1.5rem] border transition ${
            isSubscriptionMode
              ? 'border-[var(--gold-antique)] bg-[color-mix(in_srgb,var(--gold-antique)_12%,white)]'
              : 'border-[#E5D9C4] bg-white'
          }`}
        >
          <button
            type="button"
            onClick={() => setPurchaseMode('SUBSCRIPTION')}
            className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
            aria-pressed={isSubscriptionMode}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  isSubscriptionMode ? 'border-[var(--sage-deep)]' : 'border-[var(--sage-deep)]/35'
                }`}
              >
                {isSubscriptionMode ? <span className="h-2.5 w-2.5 rounded-full bg-[var(--sage-deep)]" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--sage-deep)]">
                    {t('app.components.subscriptions.blend_subscription_card.subscription_title')}
                  </p>
                  <span className="rounded-full bg-[var(--sage-deep)] px-2.5 py-1 text-xs font-semibold text-white">
                    -10%
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--sage-deep)]/68">
                  {t('app.components.subscriptions.blend_subscription_card.subscription_description')}
                </p>
              </div>
            </div>

            <div className="text-right whitespace-nowrap">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--sage-deep)]/50 line-through whitespace-nowrap">
                {(basePriceCents / 100).toFixed(2)} €
              </p>
              <p className="font-display text-2xl text-[var(--sage-deep)] whitespace-nowrap">
                {(discountedPriceCents / 100).toFixed(2)} €
              </p>
            </div>
          </button>

          {isSubscriptionMode ? (
            <div className="border-t border-[var(--gold-antique)]/20 px-4 pb-4 pt-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-[var(--sage-deep)]/68">
                  {t('app.components.subscriptions.blend_subscription_card.delivery_every')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {INTERVAL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setIntervalCount(option.value)}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${
                        intervalCount === option.value
                          ? 'border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white'
                          : 'border-[#D8CCB5] bg-white text-[var(--sage-deep)] hover:border-[var(--sage-deep)]/50'
                      }`}
                    >
                      {t(`app.components.subscriptions.blend_subscription_card.${option.key}`)}
                    </button>
                  ))}
                </div>
              </div>

              <ul className="mt-4 grid gap-1.5 text-sm text-[var(--sage-deep)]/76">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sage-deep)]" />
                  <span>{t('app.components.subscriptions.blend_subscription_card.benefit_without_commitment')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sage-deep)]" />
                  <span>{t('app.components.subscriptions.blend_subscription_card.benefit_discount')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sage-deep)]" />
                  <span>{t('app.components.subscriptions.blend_subscription_card.benefit_manage')}</span>
                </li>
              </ul>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={isPrimaryDisabled}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? t('app.components.subscriptions.blend_subscription_card.loading')
            : isSubscriptionMode
              ? t('app.components.subscriptions.blend_subscription_card.cta_subscribe')
              : t('app.components.subscriptions.blend_subscription_card.cta_add_to_cart')}
        </button>
      </div>
    </div>
  );
}
