import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useBlend } from '@/context/BlendContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { categories } from '@/data/ingredients';
import { useIngredients, type Ingredient } from '@/hooks/use-ingredients';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';
import {
  BLEND_FORMAT_OPTIONS,
  DEFAULT_BLEND_FORMAT,
  normalizeBlendFormat,
  type BlendFormatCode,
} from '@/lib/blend-format';
import { CreationIngredientsList } from '@/components/creation/CreationIngredientsList';
import { DataLoadingState } from '@/components/ui/loading-state';
import { 
  Leaf, Flower, Apple, Sprout, Sparkles, 
  Check, Minus, Plus, Info, X, Heart, Eye,
  ShoppingBag, RotateCcw,
  Thermometer, Timer, Scale, Sun
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  Leaf,
  Flower,
  Apple,
  Sprout,
  Sparkles
};

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
  const richHtmlBaseClass =
    "leading-[1.55] text-[var(--sage-deep)]/80 " +
    "[&_p]:mb-2 [&_p:last-child]:mb-0 " +
    "[&_strong]:font-semibold [&_strong]:text-[var(--sage-deep)] " +
    "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4 " +
    "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-4 " +
    "[&_li]:text-[var(--sage-deep)]/80 " +
    "[&_a]:text-[var(--gold-antique)] [&_a]:underline [&_a]:underline-offset-2 " +
    "[&_h1]:mb-1.5 [&_h1]:text-lg [&_h1]:font-display [&_h1]:text-[var(--sage-deep)] " +
    "[&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-display [&_h2]:text-[var(--sage-deep)] " +
    "[&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[var(--sage-deep)]";
  const resolvedClassName = className ? `${richHtmlBaseClass} ${className}` : richHtmlBaseClass;
  return <div className={resolvedClassName} dangerouslySetInnerHTML={{ __html: sanitized }} />;
};

const VerticalAccordionTabs = ({ ingredient }: { ingredient: Ingredient }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const hasLongDescription =
    typeof ingredient.longDescription === 'string' &&
    ingredient.longDescription.trim().length > 0;
  const hasPairing =
    typeof ingredient.pairing === 'string' &&
    ingredient.pairing.trim().length > 0;

  const tabs: Array<{
    key: string;
    label: string;
    content?: string | null;
    render?: () => ReactNode;
    large?: boolean;
  }> = [
    {
      key: 'flavor',
      label: 'Profil arômatique',
      large: true,
      render: () => (
        <div className="grid gap-1 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm text-[var(--sage-deep)]/60">Intensité</span>
                <span
                  className="group relative inline-flex items-center justify-center w-4 h-4 rounded-full border border-[var(--sage-deep)]/30 text-[10px] text-[var(--sage-deep)]/70 cursor-pointer"
                  aria-label="Indique la puissance des saveurs de ce thé. De subtil et délicat à un goût franc et corsé."
                >
                  i
                  <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-lg bg-[var(--cream-apothecary)] p-2 text-xs text-[var(--sage-deep)] opacity-0 transition-opacity group-hover:opacity-100">
                    Indique la puissance des saveurs de ce thé. De subtil et délicat à un goût franc et corsé.
                  </span>
                </span>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-8 h-2 rounded-full ${
                      i < ingredient.intensity
                        ? 'bg-[var(--gold-antique)]'
                        : 'bg-[#E5E0D5]'
                    }`}
                  />
                ))}
              </div>
            </div>

            {[
              {
                label: 'Umami',
                value: ingredient.umami,
                tooltip:
                  'Sensation “savoureuse” et rondeur en bouche. Allant de quasi absent à très présent, rond et enveloppant.',
              },
              {
                label: 'Sucrosité',
                value: ingredient.sweetness,
                tooltip:
                  'Perception de douceur naturelle (sans sucre ajouté). Allant de sec/peu doux à nettement doux et gourmand.',
              },
              {
                label: 'Épaisseur',
                value: ingredient.thickness,
                tooltip:
                  'Corps/texture en bouche. Allant de léger et fluide à dense, “velouté”, presque sirupeux.',
              },
              {
                label: 'Finale',
                value: ingredient.finish,
                tooltip:
                  'Persistante aromatique après avoir avalé. Allant de vite disparue à très longue, évolutive et expressive.',
              },
            ].map((metric) => (
              <div key={metric.label}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm text-[var(--sage-deep)]/60">{metric.label}</span>
                  <span
                    className="group relative inline-flex items-center justify-center w-4 h-4 rounded-full border border-[var(--sage-deep)]/30 text-[10px] text-[var(--sage-deep)]/70 cursor-pointer"
                    aria-label={metric.tooltip}
                  >
                    i
                    <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-lg bg-[var(--cream-apothecary)] p-2 text-xs text-[var(--sage-deep)] opacity-0 transition-opacity group-hover:opacity-100">
                      {metric.tooltip}
                    </span>
                  </span>
                </div>
                <div className="flex gap-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={`${metric.label}-${index}`}
                      className={`w-8 h-2 rounded-full ${
                        index < metric.value ? 'bg-[var(--gold-antique)]' : 'bg-[#E5E0D5]'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="rounded-xl bg-[var(--cream-apothecary)]/70">
              <div className="mb-2 flex items-center">
                <span className="text-sm text-[var(--sage-deep)]/60">Aperçu de la tasse</span>
              </div>
              <div className="mx-auto w-28 h-28">
                <svg viewBox="0 0 200 200" className="h-full w-full">
                  <circle
                    cx="100"
                    cy="100"
                    r="64"
                    fill="#F8F5EE"
                    stroke="#D4C4A8"
                    strokeWidth="4"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="54"
                    fill={ingredient.color}
                    opacity="0.85"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="40"
                    fill="none"
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth="2"
                    opacity="0.4"
                  />
                  <path
                    d="M168,70 Q188,100 168,130"
                    fill="none"
                    stroke="#D4C4A8"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div
                style={{ paddingRight: '0.5rem', maxHeight: 100, overflowY: 'auto' }}
              >
                <RichHtml value={ingredient.flavor} className="text-[var(--sage-deep)]/80 text-sm" />
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'preparation',
      label: 'Préparation',
      content: ingredient.preparation,
    },
    {
      key: 'origin',
      label: 'Origine',
      content: ingredient.origin,
    },
    ...(hasPairing
      ? [
          {
            key: 'pairing',
            label: 'Affini-thé',
            content: ingredient.pairing,
          },
        ]
      : []),
    ...(hasLongDescription
      ? [
          {
            key: 'extraDetails',
            label: 'Détails supplémentaires',
            content: ingredient.longDescription,
          },
        ]
      : []),
  ];

  return (
    <div className="mt-4 bg-white border border-[#E5E0D5] rounded-lg overflow-hidden">
      {tabs.map((tab, idx) =>
        tab.content || tab.render ? (
          <div key={tab.key} style={{ flex: 'none' }}>
            <button
              className={`w-full flex items-center justify-between px-4 py-3 text-left text-[var(--sage-deep)] text-sm hover:bg-[var(--cream-apothecary)] transition-colors ${openKey === tab.key ? 'bg-[var(--cream-apothecary)]' : ''} ${idx !== 0 ? 'border-t border-[#E5E0D5]' : ''}`}
              onClick={() => setOpenKey(openKey === tab.key ? null : tab.key)}
              aria-expanded={openKey === tab.key}
              aria-controls={`tab-content-${tab.key}`}
              style={{ minHeight: 48 }}
            >
              <span>{tab.label}</span>
              {openKey === tab.key ? (
                <Minus className="w-5 h-5" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </button>
            {openKey === tab.key && (
              <div
                id={`tab-content-${tab.key}`}
                className="p-4"
                style={{ maxHeight: 276, overflowY: 'auto' }}
              >
                {tab.render ? (
                  tab.render()
                ) : (
                  <RichHtml value={tab.content} className="text-[var(--sage-deep)]/80 text-sm" />
                )}
              </div>
            )}
          </div>
        ) : null
      )}
    </div>
  );
};

const SingleAccordionSection = ({ label, value }: { label: string; value?: string | null }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasContent = typeof value === 'string' && value.trim().length > 0;

  if (!hasContent) return null;

  return (
    <div className="mt-4 bg-white border border-[#E5E0D5] rounded-lg overflow-hidden">
      <div style={{ flex: 'none' }}>
        <button
          className={`w-full flex items-center justify-between px-4 py-3 text-left text-[var(--sage-deep)] text-sm hover:bg-[var(--cream-apothecary)] transition-colors ${
            isOpen ? 'bg-[var(--cream-apothecary)]' : ''
          }`}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="single-extra-details-content"
          style={{ minHeight: 48 }}
        >
          <span>{label}</span>
          {isOpen ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        </button>
        {isOpen && (
          <div
            id="single-extra-details-content"
            className="p-4"
            style={{ maxHeight: 276, overflowY: 'auto' }}
          >
            <RichHtml value={value} className="text-[var(--sage-deep)]/80 text-sm" />
          </div>
        )}
      </div>
    </div>
  );
};

export function Creator() {
  const {
    selectedIngredients,
    blendName,
    addIngredient,
    removeIngredient,
    setBlendName,
    isIngredientSelected,
    canAddMore,
    totalPrice,
    getBlendColor,
    addToCart,
    clearBlend,
    wishlistItems,
    addCurrentBlendToWishlist
  } = useBlend();
  const { customer } = useAuth();

  const [activeCategory, setActiveCategory] = useState('base');
  const [showSummary, setShowSummary] = useState(false);
  const [showWishlistSummary, setShowWishlistSummary] = useState(false);
  const [selectedBlendFormat, setSelectedBlendFormat] = useState<BlendFormatCode>(DEFAULT_BLEND_FORMAT);
  const [lastWishlistedSnapshot, setLastWishlistedSnapshot] = useState<{
    name: string;
    ingredientSignature: string;
    blendFormat: BlendFormatCode;
  } | null>(null);
  const [wishlistDirtySinceLastSave, setWishlistDirtySinceLastSave] = useState(false);
  const [selectedIngredientDetails, setSelectedIngredientDetails] = useState<Ingredient | null>(null);
  const [isIngredientDescriptionExpanded, setIsIngredientDescriptionExpanded] = useState(false);
  const [displayedPreparation, setDisplayedPreparation] = useState<{
    temperature: string;
    infusionTime: string;
    dosage: string;
    dayMoments: string;
  } | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { ingredients, loading, error } = useIngredients();

  // Falling leaves animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    interface Leaf {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      rotation: number;
      rotationSpeed: number;
      opacity: number;
      color: string;
    }

    const leaves: Leaf[] = [];
    const colors = ['#7C9A6B', '#B8A9C9', '#E8B4B8', '#C4A77D', '#98FB98'];

    for (let i = 0; i < 15; i++) {
      leaves.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 8 + 4,
        speedY: Math.random() * 0.5 + 0.2,
        speedX: (Math.random() - 0.5) * 0.3,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        opacity: Math.random() * 0.3 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      leaves.forEach(leaf => {
        leaf.y += leaf.speedY;
        leaf.x += leaf.speedX + Math.sin(leaf.y * 0.01) * 0.3;
        leaf.rotation += leaf.rotationSpeed;

        if (leaf.y > canvas.height + leaf.size) {
          leaf.y = -leaf.size;
          leaf.x = Math.random() * canvas.width;
        }

        ctx.save();
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(leaf.rotation);
        ctx.globalAlpha = leaf.opacity;
        ctx.fillStyle = leaf.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, leaf.size, leaf.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);

  useEffect(() => {
    if (!showSummary && !showWishlistSummary) return;
    const id = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [showSummary, showWishlistSummary]);

  useEffect(() => {
    setIsIngredientDescriptionExpanded(false);
  }, [selectedIngredientDetails?.id]);

  useEffect(() => {
    const lastBase = [...selectedIngredients]
      .reverse()
      .find(ing => ing.category === 'base');

    if (!lastBase) {
      setDisplayedPreparation(null);
      return;
    }

    const temperature = lastBase.temperature?.trim() || '';
    const infusionTime = lastBase.infusionTime?.trim() || '';
    const dosage = lastBase.dosage?.trim() || '';
    const dayMomentsList = Array.isArray(lastBase.dayMoments)
      ? lastBase.dayMoments.filter(Boolean)
      : [];
    const dayMoments = dayMomentsList.join(', ');
    const isComplete = Boolean(temperature && infusionTime && dosage && dayMoments);

    if (isComplete) {
      setDisplayedPreparation({ temperature, infusionTime, dosage, dayMoments });
    }
  }, [selectedIngredients]);

  const handleIngredientClick = (ingredient: Ingredient) => {
    if (isIngredientSelected(ingredient.id)) {
      removeIngredient(ingredient.id);
    } else if (canAddMore) {
      addIngredient(ingredient);
    }
  };

  const hasBase = selectedIngredients.some(ing => ing.category === 'base');
  const hasAdditional = selectedIngredients.some(ing => ing.category !== 'base');
  const canFinalize = hasAdditional;
  const hasBasePreparation = Boolean(displayedPreparation);
  const isAuthenticated = Boolean(customer?.email);
  const orderedSelectedIngredients = useMemo(
    () => sortIngredientsByCategoryOrder(selectedIngredients),
    [selectedIngredients]
  );

  const currentCategory = categories.find(cat => cat.id === activeCategory);
  const categoryIngredients = ingredients.filter(ing => ing.category === activeCategory);
  const isBaseIngredient = (ingredient: Ingredient) =>
    String(ingredient.category || '').toLowerCase() === 'base';
  const isIngredientWithLongDescription = (ingredient: Ingredient) => {
    const normalizedCategory = String(ingredient.category || '').toLowerCase();
    return (
      normalizedCategory === 'flower' ||
      normalizedCategory === 'fruit' ||
      normalizedCategory === 'vegetal' ||
      normalizedCategory === 'aroma'
    );
  };
  const selectedIngredientFlavorTags =
    selectedIngredientDetails && !isBaseIngredient(selectedIngredientDetails)
      ? (() => {
          const normalizedFlavors = Array.isArray(selectedIngredientDetails.flavors)
            ? selectedIngredientDetails.flavors
                .filter((flavor): flavor is string => typeof flavor === 'string')
                .map((flavor) => flavor.trim())
                .filter(Boolean)
            : [];
          if (normalizedFlavors.length > 0) {
            return Array.from(new Set(normalizedFlavors));
          }
          const singleFlavor = selectedIngredientDetails.flavor?.trim();
          return singleFlavor ? [singleFlavor] : [];
        })()
      : [];
  const selectedIngredientBenefits = selectedIngredientDetails
    ? Array.isArray(selectedIngredientDetails.benefits)
      ? selectedIngredientDetails.benefits
          .filter((benefit): benefit is string => typeof benefit === 'string')
          .map((benefit) => benefit.trim())
          .filter(Boolean)
      : []
    : [];
  const selectedIngredientLongDescription =
    selectedIngredientDetails &&
    isIngredientWithLongDescription(selectedIngredientDetails) &&
    typeof selectedIngredientDetails.longDescription === 'string'
      ? selectedIngredientDetails.longDescription.trim()
      : '';
  const selectedIngredientDescription = selectedIngredientDetails
    ? String(selectedIngredientDetails.description || '').trim()
    : '';
  const isSelectedIngredientDescriptionLong = selectedIngredientDescription.length > 150;
  const visibleSelectedIngredientDescription =
    isSelectedIngredientDescriptionLong && !isIngredientDescriptionExpanded
      ? `${selectedIngredientDescription.slice(0, 150)}...`
      : selectedIngredientDescription;

  const dotPositions = [
    { top: '1%', left: '41%' },
    { top: '13%', left: '68%' },
    { top: '13%', left: '19%' },
    { top: '24%', left: '95%' },
    { top: '30%', left: '-9%' },
    { top: '54%', left: '107%' },
    { top: '53%', left: '5%' },
    { top: '85%', left: '79%' },
    { top: '79%', left: '8%' },
    { top: '96%', left: '56%' },
  ];

  const currentWishlistIngredientSignature = selectedIngredients
    .map((ingredient) => ingredient.id)
    .filter(Boolean)
    .slice()
    .sort()
    .join(',');
  const currentWishlistName = blendName.trim() || 'Ma création';
  const currentWishlistBlendFormat = normalizeBlendFormat(selectedBlendFormat);
  const isCurrentCreationWishlisted =
    currentWishlistIngredientSignature.length > 0 &&
    wishlistItems.some((item) => {
      const itemSignature = (item.ingredientIds || []).slice().sort().join(',');
      const itemBlendFormat = normalizeBlendFormat(item.blendFormat || DEFAULT_BLEND_FORMAT);
      return (
        item.name === currentWishlistName &&
        itemSignature === currentWishlistIngredientSignature &&
        itemBlendFormat === currentWishlistBlendFormat
      );
    });
  const isHeartActive = isCurrentCreationWishlisted && !wishlistDirtySinceLastSave;

  useEffect(() => {
    if (!isAuthenticated) {
      setLastWishlistedSnapshot(null);
      setWishlistDirtySinceLastSave(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!lastWishlistedSnapshot || wishlistDirtySinceLastSave) return;
    const hasChangedSinceLastWishlistSave =
      currentWishlistName !== lastWishlistedSnapshot.name ||
      currentWishlistIngredientSignature !== lastWishlistedSnapshot.ingredientSignature ||
      currentWishlistBlendFormat !== lastWishlistedSnapshot.blendFormat;
    if (hasChangedSinceLastWishlistSave) {
      setWishlistDirtySinceLastSave(true);
    }
  }, [
    currentWishlistBlendFormat,
    currentWishlistIngredientSignature,
    currentWishlistName,
    lastWishlistedSnapshot,
    wishlistDirtySinceLastSave,
  ]);

  const renderBlendFormatSelector = () => (
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
  );

  return (
    <section 
      id="creator" 
      ref={sectionRef}
      className="relative min-h-screen w-full bg-[#FAF8F3] py-20"
    >
      {/* Falling Leaves Canvas */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none w-full"
        style={{ opacity: 0.6, display: 'block' }}
      />

      <div className="relative z-10 max-w-[100rem] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block text-sm uppercase tracking-[3px] text-[var(--gold-antique)] font-medium mb-4">
            L'Atelier du Maître Mélangeur
          </span>
          <h2 className="font-display text-4xl md:text-5xl text-[var(--sage-deep)] mb-4">
            Créez Votre <span className="italic">Signature</span>
          </h2>
          <p className="text-[var(--sage-deep)]/60 max-w-xl mx-auto">
            Suivez les étapes et assemblez votre composition parfaite. 
            Jusqu'à 10 ingrédients pour un mélange harmonieux.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--sage-deep)]/60">
              {selectedIngredients.length} / 10 ingrédients
            </span>
            <span className="text-sm font-medium text-[var(--gold-antique)]">
              {Math.round((selectedIngredients.length / 10) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-[#E5E0D5] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[var(--gold-antique)] to-[#D4B872] transition-all duration-500"
              style={{ width: `${(selectedIngredients.length / 10) * 100}%` }}
            />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left: Tea Cup Visualization */}
          <div className="lg:col-span-2">
            <div className="sticky top-8">
              <div className="relative bg-white rounded-3xl p-8 shadow-lg">
                {isAuthenticated ? (
                  <button
                    onClick={() => {
                      setShowWishlistSummary(true);
                    }}
                    disabled={!canFinalize}
                    className="absolute top-6 right-6 w-6 h-6 bg-white/80 rounded-full transition-all duration-300 hover:bg-white z-20 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Ajouter la création à la wishlist"
                  >
                    <Heart
                      className={`w-4 h-4 transition-colors ${
                        isHeartActive
                          ? 'text-red-500 fill-red-500'
                          : 'text-[var(--sage-deep)]'
                      }`}
                    />
                  </button>
                ) : null}
                <h3 className="font-display text-xl text-[var(--sage-deep)] mb-6 text-center">
                  Votre Création
                </h3>
                
                {/* Tea Cup */}
                <div className="relative w-56 h-56 mx-auto mb-8">
                  {/* Steam */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2">
                    <div className="w-2 h-8 bg-gradient-to-t from-[var(--gold-antique)]/30 to-transparent rounded-full animation-steam" />
                    <div className="w-2 h-6 bg-gradient-to-t from-[var(--gold-antique)]/20 to-transparent rounded-full animation-steam absolute left-4 top-2" style={{ animationDelay: '0.5s' }} />
                    <div className="w-2 h-7 bg-gradient-to-t from-[var(--gold-antique)]/25 to-transparent rounded-full animation-steam absolute -left-4 top-1" style={{ animationDelay: '1s' }} />
                  </div>
                  
                  {/* Cup */}
                  <div className="relative w-full h-full">
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                      {/* Cup body */}
                      <path 
                        d="M40,60 Q40,160 100,160 Q160,160 160,60" 
                        fill="none" 
                        stroke="#D4C4A8" 
                        strokeWidth="3"
                      />
                      {/* Cup rim */}
                      <ellipse cx="100" cy="60" rx="60" ry="15" fill="none" stroke="#D4C4A8" strokeWidth="3" />
                      {/* Tea liquid */}
                      <ellipse 
                        cx="100" 
                        cy="65" 
                        rx={50 + selectedIngredients.length * 2} 
                        ry={12 + selectedIngredients.length * 0.5} 
                        fill={getBlendColor()}
                        opacity="0.8"
                      />
                      {/* Handle */}
                      <path 
                        d="M160,80 Q190,80 190,110 Q190,140 160,140" 
                        fill="none" 
                        stroke="#D4C4A8" 
                        strokeWidth="3"
                      />
                    </svg>
                    
                    {/* Floating ingredients around cup */}
                    {selectedIngredients.slice(0, 10).map((ing, i) => (
                      <div 
                        key={ing.id}
                        className="absolute w-5 h-5 rounded-full animation-float"
                        style={{
                          backgroundColor: ing.color,
                          top: dotPositions[i]?.top || '45%',
                          left: dotPositions[i]?.left || '45%',
                          animationDelay: `${i * 0.3}s`
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Selected Ingredients List */}
                <CreationIngredientsList
                  ingredients={selectedIngredients.map((ingredient) => ({
                    id: ingredient.id,
                    name: ingredient.name,
                    color: ingredient.color,
                    category: ingredient.category,
                  }))}
                  onRemoveIngredient={removeIngredient}
                  emptyText="Sélectionnez vos ingrédients pour commencer"
                  className="mb-6"
                />
                {(hasBasePreparation && displayedPreparation) || (hasAdditional && !hasBase) ? (
                  <div className="mb-6">
                    <div className="grid grid-cols-2 border border-[#EEE6D8] rounded-xl overflow-hidden bg-[var(--cream-apothecary)] [&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t [&>*]:border-[#EEE6D8]">
                      <div className="flex items-start gap-3 p-3">
                        <Thermometer className="w-5 h-5 text-[var(--sage-deep)] mt-0.5" />
                        <div>
                          <p className="text-xs text-[var(--sage-deep)]/60">Température d'infusion</p>
                          <p className="text-sm text-[var(--sage-deep)]">
                            {hasBasePreparation && displayedPreparation ? displayedPreparation.temperature : '95°C'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3">
                        <Timer className="w-5 h-5 text-[var(--sage-deep)] mt-0.5" />
                        <div>
                          <p className="text-xs text-[var(--sage-deep)]/60">Temps d'infusion</p>
                          <p className="text-sm text-[var(--sage-deep)]">
                            {hasBasePreparation && displayedPreparation ? displayedPreparation.infusionTime : '7-10 min'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3">
                        <Scale className="w-5 h-5 text-[var(--sage-deep)] mt-0.5" />
                        <div>
                          <p className="text-xs text-[var(--sage-deep)]/60">Dosage</p>
                          <p className="text-sm text-[var(--sage-deep)]">
                            {hasBasePreparation && displayedPreparation ? displayedPreparation.dosage : '12 g/L (≈ 3 g pour 25 cl)'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3">
                        <Sun className="w-5 h-5 text-[var(--sage-deep)] mt-0.5" />
                        <div>
                          <p className="text-xs text-[var(--sage-deep)]/60">Moment de la journée</p>
                          <p className="text-sm text-[var(--sage-deep)]">
                            {hasBasePreparation && displayedPreparation ? displayedPreparation.dayMoments : 'Toute la journée'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Price & Actions */}
                <div className="border-t border-[#E5E0D5] pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-[var(--sage-deep)]/60">Prix total</span>
                    <span className="font-display text-2xl text-[var(--gold-antique)]">
                      {totalPrice.toFixed(2)} €
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setShowSummary(true);
                      }}
                      disabled={!canFinalize}
                      className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Finaliser</span>
                    </button>
                    <button 
                      onClick={() => { clearBlend(); }}
                      className="p-3 border border-[#E5E0D5] rounded hover:bg-[var(--cream-apothecary)] transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 text-[var(--sage-deep)]" />
                    </button>
                  </div>
                  
                  {!canFinalize && selectedIngredients.length > 0 && (
                    <p className="text-xs text-center text-amber-600 mt-2">
                      Ajoutez au moins un ingrédient hors base
                    </p>
                  )}
                  {hasAdditional && !hasBase && (
                    <p className="text-xs text-center text-[var(--sage-deep)]/70 mt-2">
                      Infusion sans base = mélange plus concentré, prix ajusté
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Ingredient Selection */}
          <div className="lg:col-span-3">
            {/* Category Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              {categories.map(cat => {
                const Icon = iconMap[cat.icon];
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-300 ${
                      activeCategory === cat.id
                        ? 'bg-[var(--sage-deep)] text-white'
                        : 'bg-white text-[var(--sage-deep)] hover:bg-[var(--cream-apothecary)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{cat.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Category Description */}
            {currentCategory && (
              <div className="mb-6 p-4 bg-white/60 rounded-xl">
                <p className="text-[var(--sage-deep)]/70 text-sm">
                  {currentCategory.description}
                </p>
              </div>
            )}

            {/* Ingredients Grid */}
            {loading && (
              <DataLoadingState
                size="md"
                className="py-8"
                title="Chargement des ingrédients..."
                titleClassName="text-sm text-[var(--sage-deep)]/60"
              />
            )}

            {error && (
              <div className="text-center py-8 text-sm text-red-600">
                Erreur: {error}
              </div>
            )}

            {!loading && !error && categoryIngredients.length === 0 && (
              <div className="text-center py-8 text-sm text-[var(--sage-deep)]/60">
                Aucun ingrédient disponible pour cette catégorie.
              </div>
            )}

            {!loading && !error && categoryIngredients.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {categoryIngredients.map(ingredient => {
                  const isSelected = isIngredientSelected(ingredient.id);
                  const isDisabled = !isSelected && !canAddMore;
                  return (
                    <div
                      key={ingredient.id}
                      className="group"
                    >
                      <div
                        onClick={() => {
                          if (!isDisabled) {
                            handleIngredientClick(ingredient);
                          }
                        }}
                        className={`relative bg-white rounded-2xl overflow-hidden transition-all duration-300 ${
                          isSelected
                            ? 'bg-white border-2 border-[var(--gold-antique)] shadow-lg cursor-pointer'
                            : canAddMore
                            ? 'bg-white border-2 border-transparent hover:border-[var(--gold-antique)]/50 hover:shadow-md cursor-pointer'
                            : 'bg-gray-100 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {/* Status Icons */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIngredientDetails(ingredient);
                          }}
                          aria-label={`Voir les détails de ${ingredient.name}`}
                          className={`absolute right-3 w-6 h-6 rounded-full flex items-center justify-center z-20 transition-all duration-300 ${
                            isSelected ? 'top-10 bg-white border border-[var(--gold-antique)]/40' : 'top-3 bg-white border border-[var(--sage-deep)]/20'
                          }`}
                        >
                          <Eye className="w-4 h-4 text-[var(--sage-deep)]" />
                        </button>

                        {isSelected && (
                          <div className="absolute top-3 right-3 w-6 h-6 bg-[var(--gold-antique)] rounded-full flex items-center justify-center z-30">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}

                        {/* Image */}
                        <div
                          className="relative aspect-square overflow-hidden"
                          style={{ backgroundColor: ingredient.color + '15' }}
                        >
                          <img
                            src={ingredient.image}
                            alt={ingredient.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />

                          {/* Overlay on hover */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="absolute bottom-4 left-4 right-4">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedIngredientDetails(ingredient);
                                }}
                                className="w-full py-2 bg-white/90 rounded-lg text-sm font-medium text-[var(--sage-deep)] flex items-center justify-center gap-2"
                              >
                                <Info className="w-4 h-4" />
                                Voir détails
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-4">
                          <h4 className="font-display text-[0.9rem] leading-6 text-[var(--sage-deep)] mb-1">
                            {ingredient.name}
                          </h4>
                          <p className="text-sm text-[var(--sage-deep)]/60 line-clamp-2">
                            {ingredient.description}
                          </p>

                          {/* Benefits */}
                          <div className="flex flex-wrap gap-1 mt-3">
                            {ingredient.benefits.slice(0, 2).map(benefit => (
                              <span
                                key={benefit}
                                className="px-2 py-0.5 bg-[var(--cream-apothecary)] rounded-full text-xs text-[var(--sage-deep)]/70"
                              >
                                {benefit}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ingredient Detail Modal */}
      {selectedIngredientDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedIngredientDetails(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-[80rem] w-full max-h-[100vh] overflow-y-auto"
            style={{ overflowY: 'auto', maxHeight: '100vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid md:grid-cols-2">
              <div
                className="aspect-square md:aspect-auto"
                style={{ backgroundColor: selectedIngredientDetails.color + '20' }}
              >
                <img
                  src={selectedIngredientDetails.image}
                  alt={selectedIngredientDetails.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-8">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-sm text-[var(--gold-antique)] font-medium uppercase tracking-wide">
                      {categories.find(c => c.id === selectedIngredientDetails.category)?.name}
                    </span>
                    <h3 className="font-display text-2xl text-[var(--sage-deep)] mt-1">
                      {selectedIngredientDetails.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedIngredientDetails(null)}
                    className="p-2 hover:bg-[var(--cream-apothecary)] rounded-full transition-colors"
                    aria-label="Fermer les détails"
                  >
                    <X className="w-5 h-5 text-[var(--sage-deep)]" />
                  </button>
                </div>

                {selectedIngredientDescription && (
                  <p className="text-[var(--sage-deep)]/70 mb-6">
                    {visibleSelectedIngredientDescription}
                    {isSelectedIngredientDescriptionLong && (
                      <button
                        type="button"
                        className="ml-1 text-[var(--gold-antique)] hover:underline"
                        onClick={() => setIsIngredientDescriptionExpanded((prev) => !prev)}
                      >
                        {isIngredientDescriptionExpanded ? 'Voir -' : 'Voir +'}
                      </button>
                    )}
                  </p>
                )}

                {selectedIngredientBenefits.length > 0 && (
                  <div className="mb-6">
                    <span className="text-sm text-[var(--sage-deep)]/60 mb-2 block">Bienfaits</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedIngredientBenefits.map((benefit) => (
                        <span
                          key={benefit}
                          className="px-3 py-1.5 bg-[var(--cream-apothecary)] rounded-full text-sm text-[var(--sage-deep)]"
                        >
                          {benefit}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isBaseIngredient(selectedIngredientDetails) && (
                  <div className="mb-6">
                    <div className="grid grid-cols-2 border border-[#EEE6D8] rounded-xl overflow-hidden bg-[var(--cream-apothecary)] [&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t [&>*]:border-[#EEE6D8]">
                      {selectedIngredientDetails.temperature && (
                        <div className="flex items-start gap-3 p-3">
                          <Thermometer className="w-5 h-5 text-[var(--sage-deep)] mt-0.5" />
                          <div>
                            <p className="text-xs text-[var(--sage-deep)]/60">Température d'infusion</p>
                            <p className="text-sm text-[var(--sage-deep)]">{selectedIngredientDetails.temperature}</p>
                          </div>
                        </div>
                      )}
                      {selectedIngredientDetails.infusionTime && (
                        <div className="flex items-start gap-3 p-3">
                          <Timer className="w-5 h-5 text-[var(--sage-deep)] mt-0.5" />
                          <div>
                            <p className="text-xs text-[var(--sage-deep)]/60">Temps d'infusion</p>
                            <p className="text-sm text-[var(--sage-deep)]">{selectedIngredientDetails.infusionTime}</p>
                          </div>
                        </div>
                      )}
                      {selectedIngredientDetails.dosage && (
                        <div className="flex items-start gap-3 p-3">
                          <Scale className="w-5 h-5 text-[var(--sage-deep)] mt-0.5" />
                          <div>
                            <p className="text-xs text-[var(--sage-deep)]/60">Dosage</p>
                            <p className="text-sm text-[var(--sage-deep)]">{selectedIngredientDetails.dosage}</p>
                          </div>
                        </div>
                      )}
                      {Array.isArray(selectedIngredientDetails.dayMoments) && selectedIngredientDetails.dayMoments.length > 0 && (
                        <div className="flex items-start gap-3 p-3">
                          <Sun className="w-5 h-5 text-[var(--sage-deep)] mt-0.5" />
                          <div>
                            <p className="text-xs text-[var(--sage-deep)]/60">Moment de la journée</p>
                            <p className="text-sm text-[var(--sage-deep)]">{selectedIngredientDetails.dayMoments.join(', ')}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!isBaseIngredient(selectedIngredientDetails) && selectedIngredientFlavorTags.length > 0 && (
                  <div className="mb-6">
                    <span className="text-sm text-[var(--sage-deep)]/60 mb-2 block">Saveurs</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedIngredientFlavorTags.map((flavor) => (
                        <span
                          key={flavor}
                          className="px-3 py-1.5 bg-[var(--cream-apothecary)] rounded-full text-sm text-[var(--sage-deep)]"
                        >
                          {flavor}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedIngredientLongDescription.length > 0 && (
                  <div className="mb-6">
                    <SingleAccordionSection
                      label="Détails supplémentaires"
                      value={selectedIngredientLongDescription}
                    />
                  </div>
                )}

                {isBaseIngredient(selectedIngredientDetails) && (
                  <div className="mb-6">
                    <VerticalAccordionTabs ingredient={selectedIngredientDetails} />

                    {!selectedIngredientDetails.dayMoments?.length &&
                      !selectedIngredientDetails.infusionTime &&
                      !selectedIngredientDetails.dosage &&
                      !selectedIngredientDetails.temperature &&
                      !selectedIngredientDetails.preparation &&
                      !selectedIngredientDetails.origin &&
                      !selectedIngredientDetails.flavor &&
                      !selectedIngredientDetails.pairing &&
                      !selectedIngredientDetails.longDescription && (
                        <div className="text-[var(--sage-deep)]/60 mt-3">Informations de préparation indisponibles.</div>
                      )}
                  </div>
                )}


                <button
                  onClick={() => {
                    handleIngredientClick(selectedIngredientDetails);
                    setSelectedIngredientDetails(null);
                  }}
                  disabled={!isIngredientSelected(selectedIngredientDetails.id) && !canAddMore}
                  className="w-full btn-primary disabled:opacity-50"
                >
                  {isIngredientSelected(selectedIngredientDetails.id) ? 'Retirer de ma création' : 'Utiliser dans ma création'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary / Confirmation Modal */}
      {showSummary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm cursor-close-cross"
          onClick={() => setShowSummary(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto cursor-default"
            onClick={(event) => event.stopPropagation()}
          >
            <>
              <h3 className="font-display text-2xl text-[var(--sage-deep)] mb-2 text-center">
                Nommez Votre Création
              </h3>
              <p className="text-center text-[var(--sage-deep)]/60 text-sm mb-6">
                Donnez une identité à votre mélange. Il mérite un nom aussi unique que sa composition.
              </p>

              <input
                type="text"
                value={blendName}
                onChange={(e) => setBlendName(e.target.value)}
                placeholder="Ex: Mon Éveil Matinal"
                className="input-elegant w-full mb-6"
                ref={nameInputRef}
              />

              {/* Recipe Summary */}
              <div className="bg-[var(--cream-apothecary)] rounded-2xl p-6 mb-6">
                <h4 className="font-medium text-[var(--sage-deep)] mb-4">Votre Recette</h4>
                <div className="space-y-2">
                  {orderedSelectedIngredients.map(ing => (
                    <div key={ing.id} className="flex items-center gap-2 text-sm">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: ing.color }}
                      />
                      <span className="text-[var(--sage-deep)]">{ing.name}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#E5E0D5] mt-4 pt-4 flex justify-between">
                  <span className="text-[var(--sage-deep)]/60">Total</span>
                  <span className="font-display text-xl text-[var(--gold-antique)]">
                    {totalPrice.toFixed(2)} €
                  </span>
                </div>
              </div>
              {renderBlendFormatSelector()}

              {/* Actions */}
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowSummary(false)}
                  className="flex-1 btn-secondary"
                >
                  Modifier
                </button>
                <button 
                  onClick={async () => {
                    const name = blendName || 'Mon Mélange';
                    try {
                      const validation = await api.validateCartTotal({
                        ingredientIds: selectedIngredients.map((ing) => ing.id),
                        total: totalPrice,
                      });
                      if (!validation?.valid) {
                        return;
                      }
                    } catch (error) {
                      return;
                    }

                    addToCart({
                      name,
                      ingredients: selectedIngredients.map((ingredient) => ({
                        name: ingredient.name,
                        ingredientColor: ingredient.color || '#6B7280',
                        category: ingredient.category,
                      })),
                      ingredientIds: selectedIngredients.map((ing) => ing.id),
                      blendFormat: selectedBlendFormat,
                      price: totalPrice,
                      color: getBlendColor(),
                      quantity: 1
                    });
                    setShowSummary(false);
                    clearBlend();
                    setBlendName('');
                    setSelectedBlendFormat(DEFAULT_BLEND_FORMAT);
                  }}
                  disabled={!blendName.trim()}
                  className="flex-1 btn-primary disabled:opacity-50"
                >
                  Ajouter au Panier
                </button>
              </div>
            </>
          </div>
        </div>
      )}

      {showWishlistSummary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm cursor-close-cross"
          onClick={() => setShowWishlistSummary(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto cursor-default"
            onClick={(event) => event.stopPropagation()}
          >
            <>
              <h3 className="font-display text-2xl text-[var(--sage-deep)] mb-2 text-center">
                Nommez Votre Création
              </h3>
              <p className="text-center text-[var(--sage-deep)]/60 text-sm mb-6">
                Donnez une identité à votre mélange. Il mérite un nom aussi unique que sa composition.
              </p>

              <input
                type="text"
                value={blendName}
                onChange={(e) => setBlendName(e.target.value)}
                placeholder="Ex: Mon Éveil Matinal"
                className="input-elegant w-full mb-6"
                ref={nameInputRef}
              />

              {/* Recipe Summary */}
              <div className="bg-[var(--cream-apothecary)] rounded-2xl p-6 mb-6">
                <h4 className="font-medium text-[var(--sage-deep)] mb-4">Votre Recette</h4>
                <div className="space-y-2">
                  {orderedSelectedIngredients.map(ing => (
                    <div key={ing.id} className="flex items-center gap-2 text-sm">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: ing.color }}
                      />
                      <span className="text-[var(--sage-deep)]">{ing.name}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#E5E0D5] mt-4 pt-4 flex justify-between">
                  <span className="text-[var(--sage-deep)]/60">Total</span>
                  <span className="font-display text-xl text-[var(--gold-antique)]">
                    {totalPrice.toFixed(2)} €
                  </span>
                </div>
              </div>
              {renderBlendFormatSelector()}

              {/* Actions */}
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowWishlistSummary(false)}
                  className="flex-1 btn-secondary"
                >
                  Modifier
                </button>
                <button 
                  onClick={async () => {
                    const requestedWishlistName = blendName.trim() || 'Ma création';
                    setShowWishlistSummary(false);
                    const didAdd = await addCurrentBlendToWishlist({
                      name: blendName,
                      blendFormat: selectedBlendFormat,
                      openDrawerOnSuccess: true,
                    });
                    if (didAdd) {
                      setLastWishlistedSnapshot({
                        name: requestedWishlistName,
                        ingredientSignature: currentWishlistIngredientSignature,
                        blendFormat: currentWishlistBlendFormat,
                      });
                      setWishlistDirtySinceLastSave(false);
                    }
                  }}
                  disabled={!blendName.trim()}
                  className="flex-1 btn-primary disabled:opacity-50"
                >
                  Ajouter à ma wishlist
                </button>
              </div>
            </>
          </div>
        </div>
      )}
    </section>
  );
}






