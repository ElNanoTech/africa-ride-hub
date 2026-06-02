import { useState, useEffect, useCallback } from 'react';

export interface NotificationPreferences {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  toastEnabled: boolean;
}

const STORAGE_KEY = 'notification-preferences';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  vibrationEnabled: true,
  toastEnabled: true,
};

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
    return DEFAULT_PREFERENCES;
  });

  // Save to localStorage whenever preferences change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    }
  }, [preferences]);

  const updatePreference = useCallback(<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  return {
    preferences,
    updatePreference,
    resetPreferences,
  };
}
