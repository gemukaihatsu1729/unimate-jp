interface SafariGestureEvent extends Event {
  scale?: number;
}

interface SafariTouchEvent extends TouchEvent {
  scale?: number;
}

const ZOOM_ACTIVE_THRESHOLD = 1.05;
const DOUBLE_TAP_WINDOW_MS = 350;
const DOUBLE_TAP_MAX_DIST_PX = 80;

let installed = false;

export function isBrowserZoomed(): boolean {
  if (typeof window === 'undefined') return false;
  const scale = window.visualViewport?.scale;
  return typeof scale === 'number' && scale > ZOOM_ACTIVE_THRESHOLD;
}

function isInsideScrollableModal(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const modal = target.closest('#modal-gameover');
  return modal !== null && !modal.classList.contains('hidden');
}

function isClickableControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('a[href], button:not(.act-btn):not(:disabled), .result-ad') !== null;
}

function isPointerGameControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('#joystick-zone, #camera-swipe-zone, .act-btn, #game-canvas') !== null;
}

function getTwoFingerDistance(touches: TouchList): number {
  if (touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Prevents accidental pinch-zoom, double-tap zoom, and elastic page bounce
 * on mobile browsers (especially iOS Safari, which ignores user-scalable=no)
 * while preserving clicks on UI buttons, vertical scrolling inside the
 * game-over modal, and pinch-out recovery if the page was somehow already zoomed.
 */
export function installViewportGuard(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  installed = true;

  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let hadMultiTouch = false;
  let lastPinchDist = 0;

  const syncZoomState = (): void => {
    const zoomed = isBrowserZoomed();
    document.documentElement.classList.toggle('is-browser-zoomed', zoomed);
    if (!zoomed && (window.scrollX !== 0 || window.scrollY !== 0)) {
      window.scrollTo(0, 0);
    }
  };

  // 1. iOS Safari pinch/rotate gesture events
  document.addEventListener(
    'gesturestart',
    (ev) => {
      if (!isBrowserZoomed()) {
        ev.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    'gesturechange',
    (ev) => {
      const ge = ev as SafariGestureEvent;
      if (!isBrowserZoomed() || (typeof ge.scale === 'number' && ge.scale >= 1)) {
        ev.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    'gestureend',
    (ev) => {
      if (!isBrowserZoomed()) {
        ev.preventDefault();
      }
      syncZoomState();
    },
    { passive: false }
  );

  // 2. Multi-touch pinch prevention & non-scrollable bounce prevention
  document.addEventListener(
    'touchstart',
    (ev) => {
      if (ev.touches.length >= 2) {
        hadMultiTouch = true;
        lastPinchDist = getTwoFingerDistance(ev.touches);
        const newestTarget = ev.changedTouches[0]?.target ?? ev.target;
        if (!isBrowserZoomed() && !isClickableControl(newestTarget)) {
          ev.preventDefault();
        }
      }
    },
    { passive: false }
  );

  document.addEventListener(
    'touchmove',
    (ev) => {
      const te = ev as SafariTouchEvent;
      const hasPinchScale = typeof te.scale === 'number' && te.scale !== 1;
      const isMultiTouch = ev.touches.length >= 2 || hasPinchScale;

      if (isMultiTouch) {
        if (!isBrowserZoomed()) {
          ev.preventDefault();
          return;
        }
        // If already zoomed in externally, allow pinching inward to zoom back out,
        // but continue blocking any further zoom-in.
        const dist = getTwoFingerDistance(ev.touches);
        const expandingByScale = typeof te.scale === 'number' && te.scale >= 1;
        const expandingByDist = lastPinchDist > 0 && dist > lastPinchDist + 1;
        if (dist > 0) lastPinchDist = dist;
        if (expandingByScale || expandingByDist) {
          ev.preventDefault();
        }
        return;
      }

      // Single-finger move outside the scrollable game-over modal: stop page rubber-banding
      if (!isBrowserZoomed() && !isInsideScrollableModal(ev.target)) {
        ev.preventDefault();
      }
    },
    { passive: false }
  );

  // 3. Rapid double-tap zoom prevention on gameplay controls & non-clickable areas
  document.addEventListener(
    'touchend',
    (ev) => {
      if (ev.touches.length < 2) {
        lastPinchDist = 0;
      }

      // Pointer-driven gameplay controls (joystick, swipe zone, action buttons, canvas)
      // never rely on synthetic click events, so cancel touchend unconditionally when
      // unzoomed to block iOS double-tap zoom even during rapid multi-touch mashing.
      if (!isBrowserZoomed() && isPointerGameControl(ev.target)) {
        ev.preventDefault();
      }

      if (ev.touches.length === 0) {
        if (hadMultiTouch) {
          hadMultiTouch = false;
          lastTapTime = 0;
          syncZoomState();
          return;
        }

        if (ev.changedTouches.length === 1) {
          const touch = ev.changedTouches[0];
          const now = performance.now();
          const dt = now - lastTapTime;
          const dist = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);

          if (
            !isBrowserZoomed() &&
            dt > 0 &&
            dt < DOUBLE_TAP_WINDOW_MS &&
            dist < DOUBLE_TAP_MAX_DIST_PX &&
            !isClickableControl(ev.target)
          ) {
            ev.preventDefault();
          }

          lastTapTime = now;
          lastTapX = touch.clientX;
          lastTapY = touch.clientY;
        }
        syncZoomState();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    'touchcancel',
    () => {
      hadMultiTouch = false;
      lastPinchDist = 0;
      syncZoomState();
    },
    { passive: true }
  );

  // 4. Desktop/trackpad double-click & Ctrl+wheel pinch zoom prevention
  document.addEventListener(
    'dblclick',
    (ev) => {
      ev.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener(
    'wheel',
    (ev) => {
      if (ev.ctrlKey) {
        ev.preventDefault();
      }
    },
    { passive: false }
  );

  // 5. Keep viewport scroll locked at origin when unzoomed and track visualViewport changes
  window.addEventListener('scroll', syncZoomState, { passive: true });
  window.addEventListener('orientationchange', () => {
    syncZoomState();
    requestAnimationFrame(syncZoomState);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncZoomState);
    window.visualViewport.addEventListener('scroll', syncZoomState);
  }

  syncZoomState();
}
