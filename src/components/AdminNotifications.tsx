import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Bell, FileCheck, HeadphonesIcon, Wallet, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface NotificationItem {
  id: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  route: string;
}

export function AdminNotifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  // Realtime: refresh notification counts when relevant rows change
  useEffect(() => {
    const channel = supabase
      .channel('admin-notifications-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, () => {
        qc.invalidateQueries({ queryKey: ['admin-notif-recent-rentals'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kyc_submissions' }, () => {
        qc.invalidateQueries({ queryKey: ['admin-notif-pending-kyc'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        qc.invalidateQueries({ queryKey: ['admin-notif-open-tickets'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, () => {
        qc.invalidateQueries({ queryKey: ['admin-notif-pending-loans'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { data: pendingKyc = 0 } = useQuery({
    queryKey: ['admin-notif-pending-kyc'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('kyc_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const { data: openTickets = 0 } = useQuery({
    queryKey: ['admin-notif-open-tickets'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const { data: pendingLoans = 0 } = useQuery({
    queryKey: ['admin-notif-pending-loans'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('loans')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const { data: recentRentals = 0 } = useQuery({
    queryKey: ['admin-notif-recent-rentals'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('rentals')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since);
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const items: NotificationItem[] = [
    {
      id: 'kyc',
      label: 'KYC en attente de vérification',
      count: pendingKyc,
      icon: <FileCheck className="h-4 w-4 text-warning" />,
      route: '/admin/drivers',
    },
    {
      id: 'tickets',
      label: 'Tickets support ouverts',
      count: openTickets,
      icon: <HeadphonesIcon className="h-4 w-4 text-primary" />,
      route: '/admin/support',
    },
    {
      id: 'loans',
      label: 'Demandes de prêt en attente',
      count: pendingLoans,
      icon: <Wallet className="h-4 w-4 text-secondary" />,
      route: '/admin/loans',
    },
    {
      id: 'rentals',
      label: 'Nouvelles locations (24h)',
      count: recentRentals,
      icon: <Car className="h-4 w-4 text-success" />,
      route: '/admin/rentals',
    },
  ].filter(item => item.count > 0 && !dismissedKeys.has(item.id));

  const totalCount = items.reduce((sum, item) => sum + item.count, 0);

  const handleClick = (item: NotificationItem) => {
    setOpen(false);
    navigate(item.route);
  };

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedKeys(prev => new Set(prev).add(id));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10">
          <Bell className="h-5 w-5" />
          {totalCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-destructive rounded-full text-[10px] font-medium flex items-center justify-center text-destructive-foreground">
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 z-[100]">
        <div className="p-3 border-b border-border">
          <h4 className="font-semibold text-sm">Notifications</h4>
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Aucune notification
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <button
                key={item.id}
                className="w-full p-3 flex items-start gap-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => handleClick(item)}
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.count} {item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Cliquez pour voir</p>
                </div>
                <button
                  onClick={(e) => handleDismiss(item.id, e)}
                  className="text-xs text-muted-foreground hover:text-foreground mt-1"
                >
                  ✕
                </button>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
