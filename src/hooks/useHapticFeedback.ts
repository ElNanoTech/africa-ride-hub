import { useCallback } from 'react';

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

const hapticPatterns: Record<HapticType, number[]> = {
  light: [10],
  medium: [25],
  heavy: [50],
  success: [10, 50, 30],
  warning: [30, 50, 30],
  error: [50, 30, 50, 30, 50],
  selection: [5],
};

export function useHapticFeedback() {
  const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  const trigger = useCallback((type: HapticType = 'medium') => {
    if (!isSupported) return;
    
    try {
      navigator.vibrate(hapticPatterns[type]);
    } catch {
      // Silently fail if vibration is not available
    }
  }, [isSupported]);

  const light = useCallback(() => trigger('light'), [trigger]);
  const medium = useCallback(() => trigger('medium'), [trigger]);
  const heavy = useCallback(() => trigger('heavy'), [trigger]);
  const success = useCallback(() => trigger('success'), [trigger]);
  const warning = useCallback(() => trigger('warning'), [trigger]);
  const error = useCallback(() => trigger('error'), [trigger]);
  const selection = useCallback(() => trigger('selection'), [trigger]);

  return {
    isSupported,
    trigger,
    light,
    medium,
    heavy,
    success,
    warning,
    error,
    selection,
  };
}
