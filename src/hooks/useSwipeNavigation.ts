import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHapticFeedback } from './useHapticFeedback';

// Main driver navigation routes in order
const DRIVER_ROUTES = [
  '/driver',
  '/driver/score',
  '/driver/vehicles',
  '/driver/loans',
  '/driver/profile',
];

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  isSwiping: boolean;
}

interface UseSwipeNavigationOptions {
  enabled?: boolean;
  threshold?: number; // Minimum swipe distance in pixels
  velocityThreshold?: number; // Minimum velocity for quick swipes
  maxVerticalRatio?: number; // Max vertical/horizontal ratio to consider horizontal swipe
}

export function useSwipeNavigation({
  enabled = true,
  threshold = 80,
  velocityThreshold = 0.3,
  maxVerticalRatio = 0.5,
}: UseSwipeNavigationOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const haptic = useHapticFeedback();
  const swipeState = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    isSwiping: false,
  });

  // Find current route index
  const getCurrentRouteIndex = useCallback(() => {
    // Check for exact match first
    const exactIndex = DRIVER_ROUTES.indexOf(location.pathname);
    if (exactIndex !== -1) return exactIndex;

    // Check for prefix match (for sub-routes)
    for (let i = DRIVER_ROUTES.length - 1; i >= 0; i--) {
      if (DRIVER_ROUTES[i] !== '/driver' && location.pathname.startsWith(DRIVER_ROUTES[i])) {
        return i;
      }
    }

    // Default to home for unmatched routes under /driver
    if (location.pathname.startsWith('/driver')) {
      return 0;
    }

    return -1; // Not a driver route
  }, [location.pathname]);

  const navigateToIndex = useCallback((index: number) => {
    if (index >= 0 && index < DRIVER_ROUTES.length) {
      haptic.selection();
      navigate(DRIVER_ROUTES[index]);
    }
  }, [navigate, haptic]);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const currentIndex = getCurrentRouteIndex();
      if (currentIndex === -1) return;

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

      // Calculate velocity (pixels per millisecond)
      const velocity = Math.abs(deltaX) / deltaTime;

      // Check if it's a horizontal swipe
      const isHorizontal = Math.abs(deltaY) / Math.abs(deltaX) < maxVerticalRatio;
      const hasEnoughDistance = Math.abs(deltaX) > threshold;
      const hasEnoughVelocity = velocity > velocityThreshold;

      if (isHorizontal && (hasEnoughDistance || hasEnoughVelocity)) {
        if (deltaX > 0) {
          // Swipe right -> go to previous tab
          const prevIndex = currentIndex - 1;
          if (prevIndex >= 0) {
            navigateToIndex(prevIndex);
          }
        } else {
          // Swipe left -> go to next tab
          const nextIndex = currentIndex + 1;
          if (nextIndex < DRIVER_ROUTES.length) {
            navigateToIndex(nextIndex);
          }
        }
      }

      swipeState.current.isSwiping = false;
    };

    const handleTouchCancel = () => {
      swipeState.current.isSwiping = false;
    };

    // Add event listeners
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
    totalRoutes: DRIVER_ROUTES.length,
    routes: DRIVER_ROUTES,
  };
}
