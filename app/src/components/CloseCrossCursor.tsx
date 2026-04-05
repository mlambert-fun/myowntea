import { useEffect, useRef } from 'react';

const CLOSE_CURSOR_SURFACE_SELECTOR = '.cursor-close-cross';
const CLOSE_CURSOR_BLOCK_SELECTOR = [
  '.cursor-default',
  '[data-close-cursor-ignore="true"]',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[contenteditable="true"]',
].join(', ');

const FINE_POINTER_MEDIA_QUERY = '(hover: hover) and (pointer: fine)';

export function CloseCrossCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const cursor = cursorRef.current;

    if (!cursor) {
      return undefined;
    }

    const mediaQuery = window.matchMedia(FINE_POINTER_MEDIA_QUERY);

    if (!mediaQuery.matches) {
      return undefined;
    }

    const pointerMoveEventName = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';

    const syncCursor = (x: number, y: number, visible: boolean) => {
      cursor.style.setProperty('--translate-x', `${x}`);
      cursor.style.setProperty('--translate-y', `${y}`);
      cursor.classList.toggle('enlarge-cursor', visible);
    };

    const setCursorState = (target: EventTarget | null, x: number, y: number) => {
      if (!(target instanceof Element)) {
        syncCursor(x, y, false);
        return;
      }

      const surface = target.closest(CLOSE_CURSOR_SURFACE_SELECTOR);
      const blocked = target.closest(CLOSE_CURSOR_BLOCK_SELECTOR);

      syncCursor(x, y, Boolean(surface) && !blocked);
    };

    const hideCursor = () => {
      cursor.classList.remove('enlarge-cursor');
    };

    const handlePointerMove = (event: Event) => {
      if (!(event instanceof PointerEvent)) {
        return;
      }

      setCursorState(event.target, event.clientX, event.clientY);
    };

    const handlePointerOver = (event: Event) => {
      if (!(event instanceof PointerEvent)) {
        return;
      }

      setCursorState(event.target, event.clientX, event.clientY);
    };

    document.addEventListener(pointerMoveEventName, handlePointerMove, { capture: true, passive: true });
    document.addEventListener('pointerover', handlePointerOver, { capture: true, passive: true });
    document.addEventListener('pointerleave', hideCursor, { capture: true, passive: true });
    window.addEventListener('blur', hideCursor);
    document.addEventListener('visibilitychange', hideCursor);

    return () => {
      document.removeEventListener(pointerMoveEventName, handlePointerMove, true);
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerleave', hideCursor, true);
      window.removeEventListener('blur', hideCursor);
      document.removeEventListener('visibilitychange', hideCursor);
    };
  }, []);

  return (
    <div ref={cursorRef} className="background-cursor-wrapper" aria-hidden="true">
      <div className="background-cursor-wrapper_outer">
        <div className="background-cursor-wrapper_inner">
          <svg viewBox="0 0 15 15" fill="none">
            <path d="M3.25 3.25L11.75 11.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M11.75 3.25L3.25 11.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
