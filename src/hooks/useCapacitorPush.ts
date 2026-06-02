import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverId } from './useDriverData';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Registers for native push notifications on iOS/Android via Capacitor.
 * Saves the device token to the device_tokens table.
 * Handles foreground notification display.
 */
export function useCapacitorPush() {
  const { data: driverId } = useDriverId();
  const queryClient = useQueryClient();
  const registeredRef = useRef(false);

  useEffect(() => {
    // Only run on native platforms
    if (!Capacitor.isNativePlatform() || !driverId || registeredRef.current) return;

    const setupPush = async () => {
      try {
        // Check / request permission
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.log('Push notification permission not granted');
          return;
        }

        // Register with APNs / FCM
        await PushNotifications.register();
        registeredRef.current = true;
      } catch (err) {
        console.error('Error setting up push notifications:', err);
      }
    };

    // Listen for registration success
    const registrationListener = PushNotifications.addListener('registration', async (token) => {
      console.log('Push registration success, token:', token.value);

      const platform = Capacitor.getPlatform(); // 'ios' | 'android'

      // Upsert device token
      const { error } = await supabase
        .from('device_tokens')
        .upsert(
          {
            driver_id: driverId,
            token: token.value,
            platform,
          },
          { onConflict: 'driver_id,token' }
        );

      if (error) {
        console.error('Error saving device token:', error);
      } else {
        console.log('Device token saved successfully');
      }
    });

    // Listen for registration errors
    const errorListener = PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err.error);
    });

    // Handle foreground notifications
    const foregroundListener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received in foreground:', notification);

      // Show as toast since the OS won't show a banner while app is in foreground
      toast.info(notification.title || 'Nouvelle notification', {
        description: notification.body,
        duration: 5000,
        position: 'top-center',
      });

      // Refresh notification queries
      queryClient.invalidateQueries({ queryKey: ['driverNotifications'] });
    });

    // Handle notification tap (app opened from notification)
    const actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push notification action performed:', action);

      // Refresh data when user taps notification
      queryClient.invalidateQueries({ queryKey: ['driverNotifications'] });
    });

    setupPush();

    return () => {
      registrationListener.then(l => l.remove());
      errorListener.then(l => l.remove());
      foregroundListener.then(l => l.remove());
      actionListener.then(l => l.remove());
    };
  }, [driverId, queryClient]);
}
