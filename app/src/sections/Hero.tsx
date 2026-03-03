import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Sparkles, Truck, ShieldCheck, Gift } from 'lucide-react';
import { api } from '@/api/client';

const formatThresholdEuros = (cents: number) => {
  const euros = cents / 100;
  if (Number.isInteger(euros)) return String(euros);
  return euros.toFixed(2).replace('.', ',');
};

export function Hero() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [ingredientCountLabel, setIngredientCountLabel] = useState('40+');
  const [freeShippingThresholdLabel, setFreeShippingThresholdLabel] = useState('45');

  useEffect(() => {
    const handleScroll = () => {
      if (!heroRef.current) return;
      const scrollY = window.scrollY;
      const parallaxElements = heroRef.current.querySelectorAll('.parallax');
      parallaxElements.forEach((el, i) => {
        const speed = 0.1 + (i * 0.05);
        (el as HTMLElement).style.transform = `translateY(${scrollY * speed}px)`;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHeroStats = async () => {
      const [ingredientsResult, settingsResult] = await Promise.allSettled([
        api.getIngredients(),
        api.getStoreSettings(),
      ]);

      if (cancelled) return;

      if (ingredientsResult.status === 'fulfilled') {
        const count = Array.isArray(ingredientsResult.value) ? ingredientsResult.value.length : 0;
        const roundedDown = Math.floor(count / 5) * 5;
        setIngredientCountLabel(`${roundedDown}+`);
      } else {
        setIngredientCountLabel('40+');
      }

      if (settingsResult.status === 'fulfilled') {
        const thresholdCents = Number(settingsResult.value?.freeShippingThresholdCents);
        if (Number.isFinite(thresholdCents) && thresholdCents > 0) {
          setFreeShippingThresholdLabel(formatThresholdEuros(thresholdCents));
        } else {
          setFreeShippingThresholdLabel('45');
        }
      } else {
        setFreeShippingThresholdLabel('45');
      }
    };

    loadHeroStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToCreator = () => {
    const element = document.getElementById('creator');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-[#F5F1E8] to-[#FAF8F3]"
    >
      {/* Floating Ingredients */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Tea Leaves */}
        <div className="parallax absolute top-[15%] left-[8%] animation-float opacity-60">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7C9A6B] to-[#4A5D4E] rotate-45" />
        </div>

        {/* Rose Petal */}
        <div className="parallax absolute top-[25%] right-[12%] animation-float-delayed opacity-50">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#E8B4B8] to-[#D4A5A9]" />
        </div>

        {/* Lemon Slice */}
        <div className="parallax absolute top-[60%] left-[5%] animation-float-slow opacity-40">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FFF44F] to-[#E8D858] border-4 border-[#F5F1E8]" />
        </div>

        {/* Mint Leaf */}
        <div className="parallax absolute top-[70%] right-[8%] animation-float opacity-50">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#98FB98] to-[#7CBA7C] rotate-12" />
        </div>

        {/* Lavender */}
        <div className="parallax absolute top-[40%] left-[15%] animation-float-delayed opacity-40">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#B8A9C9] to-[#9A8BB0]" />
        </div>

        {/* Cinnamon */}
        <div className="parallax absolute top-[80%] left-[20%] animation-float-slow opacity-50">
          <div className="w-8 h-16 rounded-full bg-gradient-to-b from-[#8B4513] to-[#654321] rotate-45" />
        </div>

        {/* Small decorative dots */}
        <div className="parallax absolute top-[20%] left-[30%] w-3 h-3 rounded-full bg-[var(--gold-antique)] opacity-30 animation-pulse-soft" />
        <div
          className="parallax absolute top-[50%] right-[25%] w-2 h-2 rounded-full bg-[var(--gold-antique)] opacity-40 animation-pulse-soft"
          style={{ animationDelay: '1s' }}
        />
        <div
          className="parallax absolute top-[75%] right-[30%] w-4 h-4 rounded-full bg-[var(--gold-antique)] opacity-25 animation-pulse-soft"
          style={{ animationDelay: '0.5s' }}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 lg:px-12">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full bg-white/60 backdrop-blur-sm border border-[var(--gold-antique)]/30 animate-slide-up"
            style={{ animationDelay: '0.1s' }}
          >
            <Sparkles className="w-4 h-4 text-[var(--gold-antique)]" />
            <span className="text-sm font-medium text-[var(--sage-deep)] tracking-wide">L'Art du Mélange</span>
          </div>

          {/* Main Title */}
          <h1
            className="font-display text-5xl md:text-6xl lg:text-7xl font-medium text-[var(--sage-deep)] mb-6 leading-tight animate-slide-up"
            style={{ animationDelay: '0.2s' }}
          >
            Composez Votre
            <span className="block italic text-[var(--gold-antique)] mt-2">Thé Unique</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-lg md:text-xl text-[var(--sage-deep)]/70 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up"
            style={{ animationDelay: '0.4s' }}
          >
            Devenez l'architecte de vos saveurs. Sélectionnez les meilleurs ingrédients
            parmi nos trésors botaniques et créez un mélange qui vous ressemble.
          </p>

          {/* CTA Button */}
          <div className="animate-slide-up" style={{ animationDelay: '0.6s' }}>
            <button
              onClick={scrollToCreator}
              className="btn-primary inline-flex items-center gap-3 group"
            >
              <span>Commencer Ma Création</span>
              <ArrowDown className="w-4 h-4 transition-transform group-hover:translate-y-1" />
            </button>
          </div>

          {/* Stats */}
          <div
            className="mt-16 animate-slide-up"
            style={{ animationDelay: '0.8s' }}
          >
            <div className="w-full max-w-4xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 md:gap-16">
                <div className="text-center">
                  <div className="font-display text-3xl md:text-4xl text-[var(--gold-antique)] font-medium">{ingredientCountLabel}</div>
                  <div className="text-sm text-[var(--sage-deep)]/60 mt-1">Ingrédients</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-3xl md:text-4xl text-[var(--gold-antique)] font-medium">∞</div>
                  <div className="text-sm text-[var(--sage-deep)]/60 mt-1">Combinaisons</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-3xl md:text-4xl text-[var(--gold-antique)] font-medium">100%</div>
                  <div className="text-sm text-[var(--sage-deep)]/60 mt-1">Bio</div>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-[var(--sage-deep)]/15">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 md:gap-16">
                  <div className="text-center">
                    <Truck className="w-6 h-6 text-[var(--gold-antique)] mx-auto mb-2" />
                    <div className="text-sm text-[var(--sage-deep)]/60">Livraison offerte dès {freeShippingThresholdLabel} €</div>
                  </div>
                  <div className="text-center">
                    <ShieldCheck className="w-6 h-6 text-[var(--gold-antique)] mx-auto mb-2" />
                    <div className="text-sm text-[var(--sage-deep)]/60">Paiement sécurisé</div>
                  </div>
                  <div className="text-center">
                    <Gift className="w-6 h-6 text-[var(--gold-antique)] mx-auto mb-2" />
                    <div className="text-sm text-[var(--sage-deep)]/60">Échantillons gratuits</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Gradient Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#FAF8F3] to-transparent" />
    </section>
  );
}
