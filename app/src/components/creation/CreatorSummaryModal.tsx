import type { RefObject } from 'react';

import { BlendPurchaseSelector } from '@/components/subscriptions/BlendPurchaseSelector';
import { BLEND_FORMAT_OPTIONS, type BlendFormatCode } from '@/lib/blend-format';
import { t } from '@/lib/i18n';

const blendFormatIconMap: Record<BlendFormatCode, string> = {
  POUCH_100G: '/assets/misc/POUCH_100.svg',
  MUSLIN_20: '/assets/misc/MUSLIN_20.svg',
};

type SummaryIngredient = {
  id: string;
  name: string;
  color: string;
};

type BaseCreatorSummaryModalProps = {
  blendName: string;
  onBlendNameChange: (value: string) => void;
  orderedSelectedIngredients: SummaryIngredient[];
  blendPrice: number;
  selectedBlendFormat: BlendFormatCode;
  onBlendFormatChange: (value: BlendFormatCode) => void;
  onClose: () => void;
  nameInputRef?: RefObject<HTMLInputElement | null>;
};

type CheckoutCreatorSummaryModalProps = BaseCreatorSummaryModalProps & {
  mode: 'checkout';
  ingredientIds: string[];
  onOneTimePurchase: (quantity: number) => void | Promise<void>;
  onSubscriptionPurchase: (intervalCount: 1 | 2 | 3) => void | Promise<void>;
};

type WishlistCreatorSummaryModalProps = BaseCreatorSummaryModalProps & {
  mode: 'wishlist';
  onWishlistSave: () => void | Promise<void>;
};

type CreatorSummaryModalProps = CheckoutCreatorSummaryModalProps | WishlistCreatorSummaryModalProps;

export function CreatorSummaryModal(props: CreatorSummaryModalProps) {
  const {
    mode,
    blendName,
    onBlendNameChange,
    orderedSelectedIngredients,
    blendPrice,
    selectedBlendFormat,
    onBlendFormatChange,
    onClose,
    nameInputRef,
  } = props;

  const priceLabel =
    mode === 'checkout'
      ? t('app.sections.creator.unit_price', 'Prix unitaire')
      : t('app.sections.creator.total', 'Total');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-28 backdrop-blur-sm cursor-close-cross"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-[40rem] w-full p-8 max-h-[calc(100vh-8rem)] overflow-y-auto cursor-default"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-display text-2xl text-[var(--sage-deep)] mb-2 text-center">
          {t('app.sections.creator.name_blend')}
        </h3>
        <p className="text-center text-[var(--sage-deep)]/60 text-sm mb-6">
          {t('app.sections.creator.donnez_identite_melange')}
        </p>

        <input
          type="text"
          value={blendName}
          onChange={(event) => onBlendNameChange(event.target.value)}
          placeholder={t('app.sections.creator.my_eveil_matinal')}
          className="input-elegant w-full mb-6"
          ref={nameInputRef}
          autoFocus
        />

        <div className="bg-[var(--cream-apothecary)] rounded-2xl p-6 mb-6">
          <h4 className="font-medium text-[var(--sage-deep)] mb-4">{t('app.sections.creator.recipe')}</h4>
          <div className="space-y-2">
            {orderedSelectedIngredients.map((ingredient) => (
              <div key={ingredient.id} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ingredient.color }} />
                <span className="text-[var(--sage-deep)]">{ingredient.name}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-[#E5E0D5] mt-4 pt-4 flex justify-between">
            <span className="text-[var(--sage-deep)]/60">{priceLabel}</span>
            <span className="font-display text-xl text-[var(--gold-antique)]">{blendPrice.toFixed(2)} €</span>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="font-medium text-[var(--sage-deep)] mb-3">{t('app.sections.creator.choisissez_format')}</h4>
          <div className="grid grid-cols-2 gap-3">
            {BLEND_FORMAT_OPTIONS.map((option) => {
              const iconSrc = blendFormatIconMap[option.code];
              const isSelected = selectedBlendFormat === option.code;

              return (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => onBlendFormatChange(option.code)}
                  className={`rounded-xl border p-3 text-center transition ${
                    isSelected
                      ? 'border-[var(--gold-antique)] bg-[var(--cream-apothecary)]'
                      : 'border-[#E5E0D5] bg-white hover:border-[var(--gold-antique)]/50'
                  }`}
                >
                  <img src={iconSrc} alt="" className="w-8 h-8 mx-auto mb-2 object-contain" />
                  <span className="block text-sm font-medium text-[var(--sage-deep)] px-6">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {mode === 'checkout' ? (
          <BlendPurchaseSelector
            sourceType="CUSTOM"
            title={blendName}
            ingredientIds={props.ingredientIds}
            blendFormat={selectedBlendFormat}
            basePriceCents={Math.round(blendPrice * 100)}
            onOneTimePurchase={props.onOneTimePurchase}
            onSubscriptionPurchase={props.onSubscriptionPurchase}
            oneTimeDisabled={!blendName.trim()}
            className="mb-4"
          />
        ) : null}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 btn-secondary">
            {t('app.sections.creator.edit')}
          </button>
          {mode === 'wishlist' ? (
            <button
              onClick={() => {
                void props.onWishlistSave();
              }}
              disabled={!blendName.trim()}
              className="flex-1 btn-primary disabled:opacity-50"
            >
              {t('app.sections.creator.add_my_wishlist')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
