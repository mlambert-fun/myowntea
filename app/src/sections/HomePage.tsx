import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '@/api/client';
import { DeferredSection } from '@/components/ui/DeferredSection';
import { DataLoadingState } from '@/components/ui/loading-state';
import { Navigation } from './Navigation';
import { Hero } from './Hero';
import { Creator } from './Creator';
import { Footer } from './Footer';
import { Testimonials } from './Testimonials';

const LazyHowItWorks = lazy(() => import('./HowItWorks').then((module) => ({ default: module.HowItWorks })));
const LazyTopCreations = lazy(() => import('./TopCreations').then((module) => ({ default: module.TopCreations })));
const LazyAccessoriesHome = lazy(() =>
  import('./AccessoriesHome').then((module) => ({ default: module.AccessoriesHome }))
);
const DEFERRED_HOME_SECTION_ORDER = ['how-it-works', 'topcreations', 'accessoires', 'testimonials'] as const;
type DeferredHomeSectionId = (typeof DEFERRED_HOME_SECTION_ORDER)[number];

const getDeferredSectionIdsToRender = (targetId: string | null) => {
  if (!targetId) {
    return new Set<DeferredHomeSectionId>();
  }

  const sectionIndex = DEFERRED_HOME_SECTION_ORDER.indexOf(targetId as DeferredHomeSectionId);
  if (sectionIndex === -1) {
    return new Set<DeferredHomeSectionId>();
  }

  return new Set<DeferredHomeSectionId>(DEFERRED_HOME_SECTION_ORDER.slice(0, sectionIndex + 1));
};

function HomeSectionPlaceholder({
  minHeightClassName,
  tone = 'light',
}: {
  minHeightClassName: string;
  tone?: 'light' | 'sage';
}) {
  return (
    <div
      className={`flex items-center justify-center ${minHeightClassName} ${
        tone === 'sage' ? 'bg-[var(--sage-deep)]/4' : 'bg-[#F5F1E8]/45'
      }`}
    >
      <DataLoadingState
        size="sm"
        className="py-10"
        titleClassName={tone === 'sage' ? 'text-[var(--sage-deep)]/60 text-sm' : 'text-[var(--sage-deep)]/55 text-sm'}
      />
    </div>
  );
}

export default function HomePage() {
  const location = useLocation();
  const [ingredientCountLabel, setIngredientCountLabel] = useState('40+');
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);
  const forceRenderedSections = useMemo(
    () => getDeferredSectionIdsToRender(pendingScrollTarget),
    [pendingScrollTarget]
  );

  useEffect(() => {
    let cancelled = false;

    const loadIngredientCount = async () => {
      try {
        const ingredients = await api.getIngredients();
        if (cancelled) {
          return;
        }

        const count = Array.isArray(ingredients) ? ingredients.length : 0;
        const roundedDown = Math.floor(count / 5) * 5;
        const displayCount = roundedDown > 0 ? roundedDown : count > 0 ? count : 95;
        setIngredientCountLabel(`${displayCount}+`);
      } catch {
        if (!cancelled) {
          setIngredientCountLabel('40+');
        }
      }
    };

    void loadIngredientCount();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const scrollTo = params.get('a') || params.get('scroll');
    if (scrollTo) {
      setPendingScrollTarget(scrollTo);
    }
  }, [location.search]);

  useEffect(() => {
    const handleHomeScrollRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ targetId?: string }>;
      const targetId = customEvent.detail?.targetId?.trim();
      if (targetId) {
        setPendingScrollTarget(targetId);
      }
    };

    window.addEventListener('home-scroll-request', handleHomeScrollRequest as EventListener);
    return () => window.removeEventListener('home-scroll-request', handleHomeScrollRequest as EventListener);
  }, []);

  useEffect(() => {
    if (!pendingScrollTarget) {
      return;
    }

    const targetId = pendingScrollTarget;
    const timeouts: number[] = [];
    const scrollToTarget = (behavior: ScrollBehavior) => {
      const element = document.getElementById(targetId);
      if (!element) {
        return;
      }

      element.scrollIntoView({ behavior, block: 'start' });
    };

    [0, 160, 420, 900].forEach((delay, index) => {
      const timeoutId = window.setTimeout(() => {
        scrollToTarget(index === 0 ? 'smooth' : 'auto');
      }, delay);
      timeouts.push(timeoutId);
    });

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [pendingScrollTarget, forceRenderedSections]);

  return (
    <>
      <Navigation />
      <main>
        <Hero ingredientCountLabel={ingredientCountLabel} />
        <Creator />
        <DeferredSection
          id="how-it-works"
          forceRender={forceRenderedSections.has('how-it-works')}
          fallback={<HomeSectionPlaceholder minHeightClassName="min-h-[38rem]" />}
        >
          <Suspense fallback={<HomeSectionPlaceholder minHeightClassName="min-h-[38rem]" />}>
            <LazyHowItWorks ingredientCountLabel={ingredientCountLabel} />
          </Suspense>
        </DeferredSection>
        <DeferredSection
          id="topcreations"
          forceRender={forceRenderedSections.has('topcreations')}
          fallback={<HomeSectionPlaceholder minHeightClassName="min-h-[34rem]" />}
        >
          <Suspense fallback={<HomeSectionPlaceholder minHeightClassName="min-h-[34rem]" />}>
            <LazyTopCreations />
          </Suspense>
        </DeferredSection>
        <DeferredSection
          id="accessoires"
          forceRender={forceRenderedSections.has('accessoires')}
          fallback={<HomeSectionPlaceholder minHeightClassName="min-h-[32rem]" />}
        >
          <Suspense fallback={<HomeSectionPlaceholder minHeightClassName="min-h-[32rem]" />}>
            <LazyAccessoriesHome />
          </Suspense>
        </DeferredSection>
        <DeferredSection
          id="testimonials"
          forceRender={forceRenderedSections.has('testimonials')}
          fallback={<HomeSectionPlaceholder minHeightClassName="min-h-[36rem]" tone="sage" />}
        >
          <Testimonials ingredientCountLabel={ingredientCountLabel} />
        </DeferredSection>
      </main>
      <Footer />
    </>
  );
}
