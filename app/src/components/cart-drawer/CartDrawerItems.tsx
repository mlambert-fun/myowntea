import type { CartItem } from '@/context/BlendContext';
import { Minus, Plus, Trash } from 'lucide-react';
import { CreationCupLogo } from '@/components/creation/CreationCupLogo';
import { CreationCupThumbnail } from '@/components/creation/CreationCupThumbnail';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';
import { getBlendFormatLabel } from '@/lib/blend-format';
import { t } from "@/lib/i18n";
const isRecurringCartItem = (item: CartItem) => item.itemType === 'SUBSCRIPTION' || item.purchaseMode === 'SUBSCRIPTION';
const formatRecurringCadence = (item: CartItem) => {
    const intervalLabel = item.subscriptionIntervalCount === 2
        ? t("app.components.subscriptions.blend_subscription_card.interval_two_months")
        : item.subscriptionIntervalCount === 3
            ? t("app.components.subscriptions.blend_subscription_card.interval_three_months")
            : t("app.components.subscriptions.blend_subscription_card.interval_one_month");
    return `${t("app.components.subscriptions.blend_subscription_card.subscription_title")} · ${intervalLabel.toLowerCase()}`;
};
interface CartDrawerItemsProps {
    items: CartItem[];
    onRemove: (id: string) => void;
    onUpdateQuantity: (id: string, quantity: number) => void;
    pendingItemIds: Set<string>;
}
export function CartDrawerItems({ items, onRemove, onUpdateQuantity, pendingItemIds }: CartDrawerItemsProps) {
    if (!items || items.length === 0) {
        return (<div className="text-sm text-[var(--sage-deep)]/60">{t("app.components.cart_drawer.cart_drawer_items.cart_empty")}</div>);
    }
    return (<div className="space-y-3">
      {items.map((item) => {
            const isPending = pendingItemIds.has(item.id);
            const isRecurring = isRecurringCartItem(item);
            const orderedBlendIngredients = item.itemType === 'BLEND'
                ? sortIngredientsByCategoryOrder(item.ingredients || [])
                : [];
            const visualFillColor = orderedBlendIngredients[0]?.ingredientColor ?? item.color ?? '#C4A77D';
            return (<div key={item.id} className="flex gap-3 rounded-2xl border border-[#EEE6D8] bg-white p-3">
          <div className="shrink-0">
            {(item.itemType === 'VARIANT' || item.itemType === 'PACK') && item.imageUrl ? (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                <img src={item.imageUrl || undefined} alt={item.name} className="h-full w-full rounded-lg object-cover"/>
              </div>) : (<CreationCupThumbnail fillColor={visualFillColor} ingredientCount={(item.ingredients || []).length} recurring={isRecurring} containerClassName="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0" cupClassName="w-full h-full"/>)}
            {false && (<>
            {(item.itemType === 'VARIANT' || item.itemType === 'PACK') && item.imageUrl ? (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                <img src={item.imageUrl || undefined} alt={item.name} className="h-full w-full rounded-lg object-cover"/>
              </div>) : item.itemType === 'SUBSCRIPTION' ? (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                <div className="h-full w-full rounded-lg bg-[var(--cream-apothecary)] flex items-center justify-center text-xs">
                  ?
                </div>
              </div>) : (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                <CreationCupLogo fillColor={orderedBlendIngredients[0]?.ingredientColor || '#C4A77D'} ingredientCount={(item.ingredients || []).length} className="w-full h-full"/>
              </div>)}
            </>)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-[var(--sage-deep)] truncate">{item.name}</div>
                {item.itemType === 'BLEND' && isRecurring && (<div className="text-xs text-[var(--sage-deep)]/60 line-clamp-2">
                    {formatRecurringCadence(item)}
                  </div>)}
                {item.itemType === 'BLEND' && (<div className="text-xs text-[var(--sage-deep)]/60 line-clamp-2">
                    {orderedBlendIngredients.map((ingredient) => ingredient.name).join(', ')}
                  </div>)}
                {item.itemType === 'BLEND' && (<div className="text-xs text-[var(--sage-deep)]/60 line-clamp-2">
                    Format: {getBlendFormatLabel(item.blendFormat)}
                  </div>)}
                {item.itemType === 'VARIANT' && item.selectedOptions && item.selectedOptions.length > 0 && (<div className="text-xs text-[var(--sage-deep)]/60 line-clamp-2">
                    {item.selectedOptions.map((opt) => `${opt.name}: ${opt.value}`).join(' • ')}
                  </div>)}
                {item.itemType === 'PACK' && item.packItems && item.packItems.length > 0 && (<div className="text-xs text-[var(--sage-deep)]/60 line-clamp-2">
                    {item.packItems.map((pack) => `${pack.qty}× ${pack.title}`).join(' • ')}
                  </div>)}
                {item.itemType === 'SUBSCRIPTION' && (<div className="text-xs text-[var(--sage-deep)]/60 line-clamp-2">
                    {t("app.components.subscriptions.blend_subscription_card.subscription_title")}
                  </div>)}
              </div>
              <div className="text-right text-sm text-[var(--sage-deep)]">
                <div className="font-medium">{(item.price * item.quantity).toFixed(2)} €</div>
                <div className="mt-2 inline-flex items-center border border-[#E5E0D5] rounded-lg overflow-hidden">
                  <button type="button" onClick={() => {
                    if (item.itemType === 'SUBSCRIPTION')
                        return;
                    if (isPending)
                        return;
                    if (item.quantity <= 1) {
                        onRemove(item.id);
                        return;
                    }
                    onUpdateQuantity(item.id, item.quantity - 1);
                }} className="px-2 py-1 hover:bg-[#F3F1EE]" aria-label={t("app.components.cart_drawer.cart_drawer_items.diminuer_quantity")} disabled={item.itemType === 'SUBSCRIPTION' || isPending}>
                    <Minus className="w-3 h-3"/>
                  </button>
                  <span className="px-2 text-xs font-medium">{item.quantity}</span>
                  <button type="button" onClick={() => {
                    if (item.itemType === 'SUBSCRIPTION')
                        return;
                    if (isPending)
                        return;
                    onUpdateQuantity(item.id, item.quantity + 1);
                }} className="px-2 py-1 hover:bg-[#F3F1EE]" aria-label={t("app.components.cart_drawer.cart_drawer_items.augmenter_quantity")} disabled={item.itemType === 'SUBSCRIPTION' || isPending}>
                    <Plus className="w-3 h-3"/>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => {
                    if (isPending)
                        return;
                    onRemove(item.id);
                }} aria-label={t("app.components.cart_drawer.cart_drawer_items.delete")} className="p-2 text-red-500/70 hover:text-red-600 hover:bg-red-50 rounded-full transition" disabled={isPending}>
            <Trash className="w-4 h-4"/>
          </button>
          </div>);
        })}
    </div>);
}
