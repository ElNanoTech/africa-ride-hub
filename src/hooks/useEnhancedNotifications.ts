import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';
import { useDriverId } from './useDriverData';
import { useNotificationSound } from './useNotificationSound';
import { useNotificationPreferences } from './useNotificationPreferences';

interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
  driver_id: string;
}

const getNotificationEmoji = (type: string) => {
  switch (type) {
    case 'score_update':
      return '📊';
    case 'payment_reminder':
      return '💳';
    case 'loan_status':
      return '💰';
    case 'rental_status':
      return '🚗';
    case 'income_status':
      return '💵';
    case 'kyc_status':
      return '✅';
    case 'safety_tip':
      return '🛡️';
    case 'announcement':
      return '📢';
    default:
      return '🔔';
  }
};

export function useEnhancedNotifications() {
  const queryClient = useQueryClient();
  const { data: driverId } = useDriverId();
  const { playNotificationSound } = useNotificationSound();
  const { preferences } = useNotificationPreferences();
  const prevUnreadCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!driverId) return;

    const channel = supabase.channel(`enhanced-notifications-${driverId}`);

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `driver_id=eq.${driverId}`,
      },
      (payload) => {
        const newNotification = payload.new as NotificationPayload;

        // Invalidate queries to update UI
        queryClient.invalidateQueries({ queryKey: ['driverNotifications'] });

        // Play sound if enabled
        if (preferences.soundEnabled) {
          playNotificationSound();
        }

        // Show toast if enabled
        if (preferences.toastEnabled) {
          const emoji = getNotificationEmoji(newNotification.notification_type);
          toast.info(
            `${emoji} ${newNotification.title}`,
            {
              description: newNotification.message.length > 80 
                ? newNotification.message.substring(0, 80) + '...' 
                : newNotification.message,
              duration: 5000,
              position: 'top-center',
            }
          );
        }

        // Vibrate on mobile devices if enabled and supported
        if (preferences.vibrationEnabled && 'vibrate' in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, queryClient, playNotificationSound]);
}
