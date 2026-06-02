import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHapticFeedback } from './useHapticFeedback';

// Admin navigation routes in order (matching sidebar order)
const ADMIN_ROUTES = [
  '/admin',
  '/admin/drivers',
  '/admin/vehicles',
  '/admin/rentals',
  '/admin/loans',
  '/admin/payments',
  '/admin/support',
  '/admin/scoring',
  '/admin/analytics',
];

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  isSwiping: boolean;
}

interface UseAdminSwipeNavigationOptions {
  enabled?: boolean;
  threshold?: number;
  velocityThreshold?: number;
  maxVerticalRatio?: number;
}

export function useAdminSwipeNavigation({
  enabled = true,
  threshold = 80,
  velocityThreshold = 0.3,
  maxVerticalRatio = 0.5,
}: UseAdminSwipeNavigationOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const haptic = useHapticFeedback();
  const swipeState = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    isSwiping: false,
  });

  const getCurrentRouteIndex = useCallback(() => {
    const exactIndex = ADMIN_ROUTES.indexOf(location.pathname);
    if (exactIndex !== -1) return exactIndex;

    for (let i = ADMIN_ROUTES.length - 1; i >= 0; i--) {
      if (ADMIN_ROUTES[i] !== '/admin' && location.pathname.startsWith(ADMIN_ROUTES[i])) {
        return i;
      }
    }

    if (location.pathname.startsWith('/admin')) {
      return 0;
    }

    return -1;
  }, [location.pathname]);

  const navigateToIndex = useCallback((index: number) => {
    if (index >= 0 && index < ADMIN_ROUTES.length) {
      haptic.selection();
      navigate(ADMIN_ROUTES[index]);
    }
  }, [navigate, haptic]);

  useEffect(() => {
    if (!enabled) return;

    const isInsideScrollableElement = (target: EventTarget | null): boolean => {
      let el = target as HTMLElement | null;
      while (el) {
        // Check if element is or is inside a table
        if (el.tagName === 'TABLE' || el.tagName === 'THEAD' || el.tagName === 'TBODY' || el.tagName === 'TR' || el.tagName === 'TD' || el.tagName === 'TH') {
          return true;
        }
        // Check for overflow-x-auto class (common Tailwind pattern)
        if (el.classList?.contains('overflow-x-auto') || el.classList?.contains('overflow-x-scroll')) {
          return true;
        }
        // Check computed style for horizontal scroll capability
        const style = window.getComputedStyle(el);
        const overflowX = style.overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') {
          return true;
        }
        // Check for scrollable areas
        if (el.getAttribute('data-radix-scroll-area-viewport')) {
          return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      const currentIndex = getCurrentRouteIndex();
      if (currentIndex === -1) return;

      // Don't intercept swipes inside scrollable containers
      if (isInsideScrollableElement(e.target)) return;

      const touch = e.touches[0];
      swipeState.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        isSwiping: true,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!swipeState.current.isSwiping) return;

      const currentIndex = getCurrentRouteIndex();
      if (currentIndex === -1) {
        swipeState.current.isSwiping = false;
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - swipeState.current.startX;
      const deltaY = touch.clientY - swipeState.current.startY;
      const deltaTime = Date.now() - swipeState.current.startTime;

      const velocity = Math.abs(deltaX) / deltaTime;
      const isHorizontal = Math.abs(deltaY) / Math.abs(deltaX) < maxVerticalRatio;
      const hasEnoughDistance = Math.abs(deltaX) > threshold;
      const hasEnoughVelocity = velocity > velocityThreshold;

      if (isHorizontal && (hasEnoughDistance || hasEnoughVelocity)) {
        if (deltaX > 0) {
          const prevIndex = currentIndex - 1;
          if (prevIndex >= 0) {
            navigateToIndex(prevIndex);
          }
        } else {
          const nextIndex = currentIndex + 1;
          if (nextIndex < ADMIN_ROUTES.length) {
            navigateToIndex(nextIndex);
          }
        }
      }

      swipeState.current.isSwiping = false;
    };

    const handleTouchCancel = () => {
      swipeState.current.isSwiping = false;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [enabled, threshold, velocityThreshold, maxVerticalRatio, getCurrentRouteIndex, navigateToIndex]);

  return {
    currentRouteIndex: getCurrentRouteIndex(),
    totalRoutes: ADMIN_ROUTES.length,
    routes: ADMIN_ROUTES,
  };
}
