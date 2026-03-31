import { useEffect } from 'react';
import { useBlend } from '@/context/BlendContext';
import { CartDrawerHeader } from '@/components/cart-drawer/CartDrawerHeader';
import { CreationIngredientsList } from '@/components/creation/CreationIngredientsList';
import { CreationCupLogo } from '@/components/creation/CreationCupLogo';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';
import { getBlendFormatLabel } from '@/lib/blend-format';
import { InlineLoading } from '@/components/ui/loading-state';
import { t } from "@/lib/i18n";
export function WishlistDrawer() {
    const { isWishlistDrawerOpen, closeWishlistDrawer, wishlistDrawerMessage, wishlistItems, isWishlistLoading, removeWishlistItem, addToCart, addVariantToCart, } = useBlend();
    useEffect(() => {
        if (!isWishlistDrawerOpen)
            return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeWishlistDrawer();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [closeWishlistDrawer, isWishlistDrawerOpen]);
    return (<div className={`fixed inset-0 z-[510] ${isWishlistDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!isWishlistDrawerOpen}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 cursor-close-cross ${isWishlistDrawerOpen ? 'opacity-100' : 'opacity-0'}`} onClick={closeWishlistDrawer}/>
      <aside className={`absolute right-0 top-0 h-full w-full sm:w-[480px] bg-white shadow-2xl transition-transform duration-300 ${isWishlistDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`} onClick={(event) => event.stopPropagation()}>
        <div className="flex h-full flex-col">
          <CartDrawerHeader title={t("app.components.wishlist_drawer.wishlist_drawer.wishlist")} onClose={closeWishlistDrawer}/>
          <div className="flex-1 overflow-y-auto px-6 pb-8 pt-6 space-y-6">
            {wishlistDrawerMessage ? (<div className="rounded-2xl border border-[#EEE6D8] bg-[#FAF8F3] p-4 text-sm text-[var(--sage-deep)]">
                {wishlistDrawerMessage}
              </div>) : null}

            {isWishlistLoading && wishlistItems.length === 0 ? (<InlineLoading label={t("app.components.wishlist_drawer.wishlist_drawer.loading_wishlist")} textClassName="text-sm text-[var(--sage-deep)]/60"/>) : null}

            {!isWishlistLoading && wishlistItems.length === 0 ? (<div className="text-sm text-[var(--sage-deep)]/60">{t("app.components.wishlist_drawer.wishlist_drawer.wishlist_empty")}</div>) : null}

            {wishlistItems.map((wishlistItem) => {
            const isAccessoryWishlist = wishlistItem.itemType === 'VARIANT' || Boolean(wishlistItem.productId) || Boolean(wishlistItem.variantId);
            const primaryBaseColor = wishlistItem.base?.colors?.[0]?.hex || wishlistItem.blendColor || '#C4A77D';
            const orderedIngredients = sortIngredientsByCategoryOrder(wishlistItem.ingredients || []);
            const createdAtLabel = new Date(wishlistItem.createdAt).toLocaleString('fr-FR', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
            const selectedOptionsLabel = Array.isArray(wishlistItem.selectedOptions) && wishlistItem.selectedOptions.length > 0
                ? wishlistItem.selectedOptions
                    .map((option) => `${option.name}: ${option.value}`)
                    .join(' • ')
                : '';
            return (<div key={wishlistItem.id} className="rounded-2xl border border-[#EEE6D8] bg-white p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                        {isAccessoryWishlist
                        ? (<img src={wishlistItem.imageUrl || '/assets/misc/ingredient_placeholder.png'} alt={wishlistItem.name} className="w-full h-full rounded-lg object-cover"/>)
                        : (<CreationCupLogo fillColor={primaryBaseColor} ingredientCount={wishlistItem.ingredients.length} className="w-full h-full"/>)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--sage-deep)] truncate">{wishlistItem.name}</div>
                        <div className="text-xs text-[var(--sage-deep)]/60">{createdAtLabel}</div>
                      </div>
                    </div>
                    <div className="font-display text-[var(--gold-antique)] text-lg shrink-0">
                      {(wishlistItem.priceCents / 100).toFixed(2)} €
                    </div>
                  </div>

                  {isAccessoryWishlist
                    ? (<div className="space-y-1 text-xs text-[var(--sage-deep)]/70">
                        {selectedOptionsLabel ? (<div>{selectedOptionsLabel}</div>) : null}
                        <div>{t("app.sections.accessory_detail_page.ref_label")} : {wishlistItem.sku || '-'}</div>
                      </div>)
                    : (<>
                  <CreationIngredientsList ingredients={orderedIngredients.map((ingredient) => ({
                    id: ingredient.id,
                    name: ingredient.name,
                    color: ingredient.color,
                    category: ingredient.category,
                }))} className="max-h-40" emptyText={t("app.components.wishlist_drawer.wishlist_drawer.none_ingredient")}/>
                  <div className="text-xs text-[var(--sage-deep)]/60">
                    Format: {getBlendFormatLabel(wishlistItem.blendFormat)}
                  </div>
                  </>)}

                  <div className="flex gap-2">
                    <button className="flex-1 btn-primary" onClick={() => {
                    closeWishlistDrawer();
                    if (isAccessoryWishlist) {
                        addVariantToCart({
                            variantId: wishlistItem.variantId || undefined,
                            productId: wishlistItem.productId || undefined,
                            name: wishlistItem.name,
                            priceCents: wishlistItem.priceCents,
                            imageUrl: wishlistItem.imageUrl || null,
                            quantity: 1,
                            selectedOptions: wishlistItem.selectedOptions || [],
                        });
                        return;
                    }
                    addToCart({
                        name: wishlistItem.name,
                        ingredientIds: wishlistItem.ingredientIds,
                        blendFormat: wishlistItem.blendFormat,
                        ingredients: orderedIngredients.map((ingredient) => ({
                            name: ingredient.name,
                            ingredientColor: ingredient.color || '#6B7280',
                            category: ingredient.category,
                        })),
                        price: wishlistItem.priceCents / 100,
                        color: primaryBaseColor,
                    });
                }}>{t("app.components.wishlist_drawer.wishlist_drawer.add_cart")}</button>
                    <button className="flex-1 btn-secondary" onClick={() => {
                    void removeWishlistItem(wishlistItem.id);
                }}>{t("app.components.wishlist_drawer.wishlist_drawer.delete")}</button>
                  </div>
                </div>);
        })}
          </div>
        </div>
      </aside>
    </div>);
}
