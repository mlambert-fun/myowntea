import { useEffect, useRef, useState, type ReactNode } from 'react';

type DeferredSectionProps = {
  id?: string;
  className?: string;
  rootMargin?: string;
  fallback?: ReactNode;
  forceRender?: boolean;
  children: ReactNode;
};

export function DeferredSection({
  id,
  className,
  rootMargin = '500px 0px',
  fallback = null,
  forceRender = false,
  children,
}: DeferredSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (forceRender) {
      setShouldRender(true);
      return;
    }

    if (shouldRender) {
      return;
    }

    const node = containerRef.current;
    if (!node || typeof window === 'undefined') {
      setShouldRender(true);
      return;
    }

    const preloadDistance = 600;
    const renderIfNearViewport = () => {
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const isNearViewport =
        rect.top <= viewportHeight + preloadDistance && rect.bottom >= -preloadDistance;

      if (isNearViewport) {
        setShouldRender(true);
        return true;
      }

      return false;
    };

    if (renderIfNearViewport()) {
      return;
    }

    let observer: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setShouldRender(true);
            observer?.disconnect();
          }
        },
        { rootMargin }
      );

      observer.observe(node);
    }

    const handleViewportChange = () => {
      renderIfNearViewport();
    };

    window.addEventListener('scroll', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange);
    const rafId = window.requestAnimationFrame(handleViewportChange);
    const timeoutId = window.setTimeout(() => {
      setShouldRender(true);
    }, 2500);

    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [forceRender, rootMargin, shouldRender]);

  return (
    <div id={id} ref={containerRef} className={className}>
      {forceRender || shouldRender ? children : fallback}
    </div>
  );
}
