import { Bell, TrendingUp, CreditCard, Car, Wallet, Shield, Megaphone, CheckCheck, AlertCircle, FileText, ClipboardCheck } from 'lucide-react';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NAV, UI } from '@/lib/i18n';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDriverNotifications, useMarkNotificationRead, useDriverId } from '@/hooks/useDriverData';
import { useEnhancedNotifications } from '@/hooks/useEnhancedNotifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { KiraVoiceButton } from '@/components/driver/KiraVoiceButton';

// Map a notification type to the in-app destination it should open.
function getNotificationDeeplink(type: string): string | null {
  // FC-D2: every fleet-control notification (required / overdue / reminder /
  // approved / rejected / blocked / unblocked — current and future types)
  // opens the control screen.
  if (type.startsWith('fleet_control')) return '/driver/fleet-control';
  switch (type) {
    case 'invoice_issued':
    case 'invoice_cancelled':
    case 'invoice_paid':
      return '/driver/factures';
    case 'payment_reminder':
      return '/driver/rental';
    case 'rental_status':
      return '/driver/rental';
    case 'loan_status':
      return '/driver/loans';
    case 'score_update':
      return '/driver/score';
    default:
      return null;
  }
}

type NotificationType = 'score_update' | 'payment_reminder' | 'loan_status' | 'rental_status' | 'safety_tip' | 'announcement';

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
}

const getNotificationIcon = (type: string) => {
  if (type.startsWith('fleet_control')) {
    return <ClipboardCheck className="h-5 w-5 text-primary" />;
  }
  switch (type) {
    case 'score_update':
      return <TrendingUp className="h-5 w-5 text-primary" />;
    case 'payment_reminder':
      return <CreditCard className="h-5 w-5 text-warning" />;
    case 'loan_status':
      return <Wallet className="h-5 w-5 text-secondary" />;
    case 'rental_status':
      return <Car className="h-5 w-5 text-primary" />;
    case 'invoice_issued':
    case 'invoice_cancelled':
    case 'invoice_paid':
      return <FileText className="h-5 w-5 text-primary" />;
    case 'safety_tip':
      return <Shield className="h-5 w-5 text-tier-b" />;
    case 'announcement':
      return <Megaphone className="h-5 w-5 text-tier-c" />;
    default:
      return <Bell className="h-5 w-5 text-muted-foreground" />;
  }
};

const getNotificationBgColor = (type: string) => {
  if (type.startsWith('fleet_control')) return 'bg-primary/10';
  switch (type) {
    case 'score_update':
      return 'bg-primary/10';
    case 'payment_reminder':
      return 'bg-warning/10';
    case 'loan_status':
      return 'bg-secondary/10';
    case 'rental_status':
      return 'bg-primary/10';
    case 'invoice_issued':
    case 'invoice_cancelled':
    case 'invoice_paid':
      return 'bg-primary/10';
    case 'safety_tip':
      return 'bg-tier-b/10';
    case 'announcement':
      return 'bg-tier-c/10';
    default:
      return 'bg-muted';
  }
};

// Group notifications by date
function groupNotificationsByDate(notifications: Notification[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const thisWeek = new Date(today);
  thisWeek.setDate(thisWeek.getDate() - 7);

  const groups: { label: string; notifications: Notification[] }[] = [
    { label: UI.TODAY, notifications: [] },
    { label: UI.YESTERDAY, notifications: [] },
    { label: UI.THIS_WEEK, notifications: [] },
    { label: 'Plus ancien', notifications: [] },
  ];

  notifications.forEach((notif) => {
    const notifDate = new Date(notif.created_at);
    notifDate.setHours(0, 0, 0, 0);

    if (notifDate.getTime() === today.getTime()) {
      groups[0].notifications.push(notif);
    } else if (notifDate.getTime() === yesterday.getTime()) {
      groups[1].notifications.push(notif);
    } else if (notifDate >= thisWeek) {
      groups[2].notifications.push(notif);
    } else {
      groups[3].notifications.push(notif);
    }
  });

  return groups.filter((g) => g.notifications.length > 0);
}

function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { data: driverId } = useDriverId();

  return useMutation({
    mutationFn: async () => {
      if (!driverId) throw new Error('No driver ID');

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('driver_id', driverId)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverNotifications'] });
      toast.success('Toutes les notifications marquées comme lues');
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });
}

function NotificationListSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-4 w-24 mb-3" />
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-full mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NoDriverProfileAlert() {
  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-warning/20 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">Profil conducteur requis</h3>
            <p className="text-sm text-muted-foreground">
              Vous devez compléter votre inscription pour voir vos notifications.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { data: driverId, isLoading: isDriverIdLoading, isSuccess: isDriverIdSuccess } = useDriverId();
  const { data: notifications = [], isLoading: isNotificationsLoading } = useDriverNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Enable enhanced real-time updates with sound
  useEnhancedNotifications();

  const isLoading = isDriverIdLoading || isNotificationsLoading;
  const hasDriverProfile = !!driverId;
  
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const groupedNotifications = groupNotificationsByDate(notifications as Notification[]);
  const latestNotification = (notifications as Notification[])[0];
  const voiceText = latestNotification
    ? `Vous avez ${unreadCount} notification non lue. Derniere alerte: ${latestNotification.title}. ${latestNotification.message}`
    : 'Aucune notification pour le moment.';

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.is_read) markRead.mutate(notif.id);
    const target = getNotificationDeeplink(notif.notification_type);
    if (target) navigate(target);
  };

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: NAV.NOTIFICATIONS }]} />
      <PageHeader 
        title={NAV.NOTIFICATIONS}
        action={
          <div className="flex items-center gap-2">
            <KiraVoiceButton text={voiceText} compact />
            {hasDriverProfile && unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className="min-h-11"
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Tout lu
              </Button>
            )}
          </div>
        }
      />

      <div className="px-4 pb-6">
        {isDriverIdSuccess && driverId === null ? (
          <NoDriverProfileAlert />
        ) : isLoading ? (
          <NotificationListSkeleton />
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Bell className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Aucune notification</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groupedNotifications.map((group) => (
              <div key={group.label}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  {group.label}
                </h3>
                <Card>
                  <CardContent className="p-0 divide-y divide-border">
                    {group.notifications.map((notif) => (
                      <button
                        key={notif.id}
                        className={cn(
                          'w-full p-4 flex items-start gap-3 text-left transition-colors hover:bg-muted/50',
                          !notif.is_read && 'bg-primary/5'
                        )}
                        onClick={() => handleNotificationClick(notif)}
                      >
                        <div className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                          getNotificationBgColor(notif.notification_type)
                        )}>
                          {getNotificationIcon(notif.notification_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn(
                              'text-sm',
                              !notif.is_read && 'font-semibold'
                            )}>
                              {notif.title}
                            </p>
                            {!notif.is_read && (
                              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {notif.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatRelativeTime(new Date(notif.created_at))}
                          </p>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </DriverLayout>
  );
}
