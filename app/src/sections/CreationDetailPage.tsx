import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, Scale, Sun, Thermometer, Timer } from 'lucide-react';
import { api, type BlendListing } from '@/api/client';
import { useBlend } from '@/context/BlendContext';
import type { Ingredient as CreatorIngredient } from '@/data/ingredients';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { DataLoadingState } from '@/components/ui/loading-state';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { BLEND_FORMAT_OPTIONS, DEFAULT_BLEND_FORMAT, type BlendFormatCode } from '@/lib/blend-format';

const blendFormatIconMap: Record<BlendFormatCode, string> = {
  POUCH_100G: '/assets/misc/POUCH_100.svg',
  MUSLIN_20: '/assets/misc/MUSLIN_20.svg',
};

const sanitizeRichText = (rawHtml: string): string => {
  if (!rawHtml) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => {
    node.remove();
  });

  doc.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;

      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        return;
      }

      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return doc.body.innerHTML;
};

const RichHtml = ({ value, className }: { value?: string | null; className?: string }) => {
  const sanitized = useMemo(() => sanitizeRichText(value || ''), [value]);
  if (!sanitized.trim()) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitized }} />;
};

const getIngredientCategoryPriority = (value: unknown) => {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (normalized.startsWith('base')) return 0;
  if (normalized.startsWith('fleur') || normalized.startsWith('flower')) return 1;
  if (normalized.startsWith('fruit')) return 2;
  if (normalized.startsWith('plante') || normalized.startsWith('plant') || normalized.startsWith('herb')) return 3;
  if (
    normalized.startsWith('arome') ||
    normalized.startsWith('aroma') ||
    normalized.startsWith('flavor') ||
    normalized.startsWith('flavour')
  ) {
    return 4;
  }
  return 5;
};

const normalizeCreatorCategory = (value: unknown): CreatorIngredient['category'] => {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (normalized.startsWith('base') || normalized === 'tea') return 'base';
  if (normalized.startsWith('fleur') || normalized.startsWith('flower')) return 'flower';
  if (normalized.startsWith('fruit')) return 'fruit';
  if (
    normalized.startsWith('plante') ||
    normalized.startsWith('plant') ||
    normalized.startsWith('herb') ||
    normalized.startsWith('vegetal') ||
    normalized === 'vegetal'
  ) {
    return 'vegetal';
  }
  if (
    normalized.startsWith('arome') ||
    normalized.startsWith('aroma') ||
    normalized.startsWith('flavor') ||
    normalized.startsWith('flavour') ||
    normalized.startsWith('spice')
  ) {
    return 'aroma';
  }
  return 'base';
};

const toCreatorIngredient = (entry: any): CreatorIngredient | null => {
  const ingredient = entry?.ingredient || entry;
  const id = ingredient?.id || entry?.ingredientId;
  if (!id) return null;

  const rawIntensity = Number(ingredient?.intensity);
  const intensity = Number.isFinite(rawIntensity) ? Math.min(5, Math.max(1, Math.round(rawIntensity))) : 3;

  return {
    id: String(id),
    name: String(ingredient?.name || entry?.name || 'Ingredient'),
    category: normalizeCreatorCategory(ingredient?.category || entry?.category),
    description: typeof ingredient?.description === 'string' ? ingredient.description : '',
    benefits: Array.isArray(ingredient?.benefits) ? ingredient.benefits : [],
    intensity: intensity as 1 | 2 | 3 | 4 | 5,
    color: typeof ingredient?.color === 'string' && ingredient.color ? ingredient.color : '#6B7280',
    image:
      (typeof ingredient?.image === 'string' && ingredient.image) ||
      (typeof ingredient?.imageUrl === 'string' && ingredient.imageUrl) ||
      '/assets/misc/ingredient_placeholder.png',
    basePrice:
      typeof ingredient?.price === 'number' && Number.isFinite(ingredient.price)
        ? ingredient.price
        : typeof ingredient?.basePrice === 'number' && Number.isFinite(ingredient.basePrice)
          ? ingredient.basePrice
          : 0,
    dayMoments: Array.isArray(ingredient?.dayMoments) ? ingredient.dayMoments : null,
    infusionTime: typeof ingredient?.infusionTime === 'string' ? ingredient.infusionTime : null,
    dosage: typeof ingredient?.dosage === 'string' ? ingredient.dosage : null,
    temperature: typeof ingredient?.temperature === 'string' ? ingredient.temperature : null,
    preparation: typeof ingredient?.preparation === 'string' ? ingredient.preparation : null,
    origin: typeof ingredient?.origin === 'string' ? ingredient.origin : null,
  };
};

export default function CreationDetailPage() {
  const [listing, setListing] = useState<BlendListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBlendFormat, setSelectedBlendFormat] = useState<BlendFormatCode>(DEFAULT_BLEND_FORMAT);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [openPreparationField, setOpenPreparationField] = useState<string | null>(null);
  const { addToCart, clearBlend, addIngredient } = useBlend();
  const navigate = useNavigate();

  const slug = useMemo(() => window.location.pathname.replace('/creations/', ''), []);

  useEffect(() => {
    let mounted = true;
    api.getBlendListing(slug)
      .then((data) => {
        if (!mounted) return;
        setListing(data);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    setIsDescriptionExpanded(false);
    setOpenPreparationField(null);
  }, [listing?.id]);

  if (loading) {
    return (
      <>
        <Navigation />
        <section className="min-h-screen bg-[#FAF8F3] pt-28 pb-16">
          <div className="max-w-5xl mx-auto px-6">
            <PageBreadcrumb />
            <DataLoadingState size="md" className="py-8" titleClassName="text-[var(--sage-deep)]/70" />
          </div>
        </section>
        <Footer />
      </>
    );
  }

  if (!listing) {
    return (
      <>
        <Navigation />
        <section className="min-h-screen bg-[#FAF8F3] pt-28 pb-16">
          <div className="max-w-5xl mx-auto px-6">
            <PageBreadcrumb />
            <div className="text-[var(--sage-deep)]/70">Création introuvable.</div>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  const ingredients = listing.blend?.ingredients || [];
  const orderedIngredients = [...ingredients].sort((left: any, right: any) => {
    const leftIngredient = left.ingredient || left;
    const rightIngredient = right.ingredient || right;
    const leftPriority = getIngredientCategoryPriority(leftIngredient?.category || left.category);
    const rightPriority = getIngredientCategoryPriority(rightIngredient?.category || right.category);
    return leftPriority - rightPriority;
  });
  const listingDescription = String(listing.description || '').trim();
  const isDescriptionLong = listingDescription.length > 150;
  const visibleDescription =
    isDescriptionLong && !isDescriptionExpanded
      ? `${listingDescription.slice(0, 150)}...`
      : listingDescription;
  const coverImageUrl = listing.coverImageUrl || listing.blend?.coverImageUrl || null;
  const baseIngredient = ingredients
    .map((entry: any) => entry.ingredient || entry)
    .find((entry: any) =>
      String(entry?.category || '').toLowerCase() === 'base'
    );
  const blendDayMoments = Array.isArray(baseIngredient?.dayMoments) ? baseIngredient.dayMoments : [];
  const blendInfusionTime = typeof baseIngredient?.infusionTime === 'string' ? baseIngredient.infusionTime : '';
  const blendDosage = typeof baseIngredient?.dosage === 'string' ? baseIngredient.dosage : '';
  const blendTemperature = typeof baseIngredient?.temperature === 'string' ? baseIngredient.temperature : '';
  const blendPreparation = typeof baseIngredient?.preparation === 'string' ? baseIngredient.preparation : '';
  const blendOrigin = typeof baseIngredient?.origin === 'string' ? baseIngredient.origin : '';
  const blendFlavor = typeof baseIngredient?.flavor === 'string' ? baseIngredient.flavor : '';
  const blendPairing = typeof baseIngredient?.pairing === 'string' ? baseIngredient.pairing : '';
  const blendLongDescription = typeof baseIngredient?.longDescription === 'string' ? baseIngredient.longDescription : '';
  const preparationMetrics = [
    {
      key: 'dayMoments',
      label: 'Moments de la journée',
      value: blendDayMoments.length > 0 ? blendDayMoments.join(', ') : '',
      icon: Sun,
    },
    {
      key: 'infusionTime',
      label: "Temps d'infusion",
      value: blendInfusionTime,
      icon: Timer,
    },
    {
      key: 'dosage',
      label: 'Dosage',
      value: blendDosage,
      icon: Scale,
    },
    {
      key: 'temperature',
      label: 'Température',
      value: blendTemperature,
      icon: Thermometer,
    },
  ].filter((metric) => Boolean(metric.value));
  const preparationTabs = [
    { key: 'flavor', label: 'Profil aromatique', content: blendFlavor },
    { key: 'preparation', label: 'Préparation', content: blendPreparation },
    { key: 'origin', label: 'Origine', content: blendOrigin },
    { key: 'pairing', label: 'Affini-thé', content: blendPairing },
    { key: 'extraDetails', label: 'Détails supplémentaires', content: blendLongDescription },
  ].filter((tab) => tab.content.trim().length > 0);
  const showPreparation = preparationMetrics.length > 0 || preparationTabs.length > 0;
  const blendPriceCents = (() => {
    const totals = ingredients.reduce(
      (acc: { baseCount: number; baseTotal: number; nonBaseTotal: number }, entry: any) => {
        const ingredient = entry.ingredient || entry;
        const unitPriceCents =
          typeof ingredient?.price === 'number' && Number.isFinite(ingredient.price)
            ? Math.max(0, Math.round(ingredient.price * 100))
            : 0;
        const quantity =
          typeof entry?.quantity === 'number' && Number.isFinite(entry.quantity)
            ? Math.max(1, Math.round(entry.quantity))
            : 1;
        const lineTotal = unitPriceCents * quantity;
        const normalizedCategory = String(ingredient?.category || entry?.category || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
        const isBase = normalizedCategory.startsWith('base') || normalizedCategory === 'tea';

        if (isBase) {
          acc.baseCount += 1;
          acc.baseTotal += lineTotal;
        } else {
          acc.nonBaseTotal += lineTotal;
        }
        return acc;
      },
      { baseCount: 0, baseTotal: 0, nonBaseTotal: 0 }
    );

    if (totals.baseCount > 0) {
      const averagedBaseTotal = totals.baseTotal / totals.baseCount;
      return Math.round(totals.nonBaseTotal + averagedBaseTotal);
    }

    const computedNoBaseCents = 390 + 2.4 * totals.nonBaseTotal;
    const clampedNoBaseCents = Math.min(1690, Math.max(990, computedNoBaseCents));
    return Math.round(clampedNoBaseCents);
  })();

  return (
    <>
      <Navigation />
      <section className="min-h-screen bg-[#FAF8F3] pt-28 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <PageBreadcrumb />
          <div className="bg-white rounded-3xl shadow overflow-hidden grid md:grid-cols-2">
            <div className="h-72 md:h-full bg-[var(--cream-apothecary)] flex items-start justify-center overflow-hidden">
              {coverImageUrl ? (
                <img src={coverImageUrl} alt={listing.title} className="w-full h-full object-cover object-top" />
              ) : (
                <div className="text-[var(--sage-deep)]/70">Création artisanale</div>
              )}
            </div>
            <div className="p-8 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="font-display text-3xl text-[var(--sage-deep)]">{listing.title}</h1>
                  {listingDescription && (
                    <p className="text-[var(--sage-deep)]/70 mt-2">
                      {visibleDescription}
                      {isDescriptionLong && (
                        <button
                          type="button"
                          className="ml-1 text-[var(--gold-antique)] hover:underline"
                          onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                        >
                          {isDescriptionExpanded ? 'Voir -' : 'Voir +'}
                        </button>
                      )}
                    </p>
                  )}
                </div>
                <span className="shrink-0 whitespace-nowrap font-display text-[2rem] text-[var(--gold-antique)]">
                  {(blendPriceCents / 100).toFixed(2)} €
                </span>
              </div>
              <div className="bg-white rounded-2xl border border-[#EEE6D8] p-4">
                <div className="text-sm font-medium text-[var(--sage-deep)] mb-2">Ingrédients</div>
                {orderedIngredients.length > 0 ? (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {orderedIngredients.map((entry: any, index: number) => {
                      const ingredient = entry.ingredient || entry;
                      const ingredientName = ingredient?.name || entry.name || 'Ingrédient';
                      const ingredientImage = ingredient?.image || '/assets/misc/ingredient_placeholder.png';

                      return (
                        <div
                          key={`${listing.id}-ingredient-thumb-${ingredient?.id || entry.ingredientId || index}`}
                          className="flex flex-col items-center text-center"
                        >
                          <div className="h-12 w-12 overflow-hidden rounded-lg bg-[var(--cream-apothecary)]">
                            <img src={ingredientImage} alt={ingredientName} className="h-full w-full object-cover" />
                          </div>
                          <span className="mt-1 min-h-[1.5rem] text-[10px] leading-3 text-[var(--sage-deep)]/70 line-clamp-2">
                            {ingredientName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--sage-deep)]/70">Aucun ingrédient.</div>
                )}
              </div>
              {showPreparation && (
                <div>
                  {preparationMetrics.length > 0 && (
                    <div className="mb-4">
                      <div className="grid grid-cols-2 border border-[#EEE6D8] rounded-xl overflow-hidden bg-[var(--cream-apothecary)] [&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t [&>*]:border-[#EEE6D8]">
                        {preparationMetrics.map((metric) => {
                          const Icon = metric.icon;
                          return (
                            <div key={metric.key} className="flex items-start gap-3 p-3">
                              <Icon className="w-5 h-5 text-[var(--sage-deep)] mt-0.5" />
                              <div>
                                <p className="text-xs text-[var(--sage-deep)]/60">{metric.label}</p>
                                <p className="text-sm text-[var(--sage-deep)]">{metric.value}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {preparationTabs.length > 0 && (
                    <div className="mt-4 bg-white border border-[#E5E0D5] rounded-lg overflow-hidden">
                      {preparationTabs.map((tab, index) => {
                        const isOpen = openPreparationField === tab.key;
                        return (
                          <div key={tab.key} style={{ flex: 'none' }}>
                            <button
                              type="button"
                              className={`w-full flex items-center justify-between px-4 py-3 text-left text-[var(--sage-deep)] text-sm hover:bg-[var(--cream-apothecary)] transition-colors ${isOpen ? 'bg-[var(--cream-apothecary)]' : ''} ${index !== 0 ? 'border-t border-[#E5E0D5]' : ''}`}
                              onClick={() => setOpenPreparationField(isOpen ? null : tab.key)}
                              aria-expanded={isOpen}
                              aria-controls={`tab-content-${tab.key}`}
                              style={{ minHeight: 48 }}
                            >
                              <span>{tab.label}</span>
                              {isOpen ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                            </button>
                            {isOpen && (
                              <div
                                id={`tab-content-${tab.key}`}
                                className="p-4"
                                style={{ maxHeight: 276, overflowY: 'auto' }}
                              >
                                <RichHtml value={tab.content} className="text-[var(--sage-deep)]/80 text-sm whitespace-pre-line" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className="mb-6">
                <h4 className="font-medium text-[var(--sage-deep)] mb-3">Choisissez votre format</h4>
                <div className="grid grid-cols-2 gap-3">
                  {BLEND_FORMAT_OPTIONS.map((option) => {
                    const iconSrc = blendFormatIconMap[option.code];
                    const isSelected = selectedBlendFormat === option.code;
                    return (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => setSelectedBlendFormat(option.code)}
                        className={`rounded-xl border p-3 text-center transition ${
                          isSelected
                            ? 'border-[var(--gold-antique)] bg-[var(--cream-apothecary)]'
                            : 'border-[#E5E0D5] bg-white hover:border-[var(--gold-antique)]/50'
                        }`}
                      >
                        <img src={iconSrc} alt="" className="w-8 h-8 mx-auto mb-2 object-contain" />
                        <span className="block text-xs text-[var(--sage-deep)]">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  className="btn-primary flex-1"
                  onClick={() => {
                    const ingredientIds = ingredients.map((entry: any) => entry.ingredientId || entry.ingredient?.id).filter(Boolean);
                    const ingredientsSnapshot = ingredients.map((entry: any) => ({
                      name: entry.ingredient?.name || entry.name,
                      ingredientColor: entry.ingredient?.color || '#6B7280',
                    }));
                    addToCart({
                      name: listing.title,
                      ingredientIds,
                      ingredients: ingredientsSnapshot,
                      price: blendPriceCents / 100,
                      color: listing.blend?.color || '#C4A77D',
                      blendFormat: selectedBlendFormat,
                    });
                  }}
                >
                  Ajouter au panier
                </button>
                <button
                  className="btn-secondary flex-1"
                  onClick={() => {
                    clearBlend();
                    orderedIngredients
                      .map((entry: any) => toCreatorIngredient(entry))
                      .filter((ingredient): ingredient is CreatorIngredient => ingredient !== null)
                      .forEach((ingredient) => addIngredient(ingredient));
                    navigate('/?scroll=creator');
                  }}
                >
                  Personnaliser ce mélange
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
