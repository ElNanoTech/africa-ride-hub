import { useLoginActivity } from '@/hooks/useLoginActivity';
import { formatLoginMethod } from '@/lib/loginActivity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Key, Fingerprint, Smartphone, TestTube2, MessageSquare, 
  CheckCircle, XCircle, MapPin, Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const LoginMethodIcon = ({ method }: { method: string }) => {
  const iconClass = "h-4 w-4";
  switch (method) {
    case 'pin':
      return <Key className={iconClass} />;
    case 'biometric':
      return <Fingerprint className={iconClass} />;
    case 'yango':
      return <Smartphone className={iconClass} />;
    case 'test':
      return <TestTube2 className={iconClass} />;
    case 'otp':
      return <MessageSquare className={iconClass} />;
    default:
      return <Key className={iconClass} />;
  }
};

export function LoginActivityList({ limit = 5 }: { limit?: number }) {
  const { data: activities, isLoading } = useLoginActivity(limit);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Aucune activité de connexion</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className={`p-3 rounded-lg border ${
            activity.success 
              ? 'bg-background border-border' 
              : 'bg-destructive/5 border-destructive/20'
          }`}
        >
          <div className="flex items-start gap-3">
            {/* Status Icon */}
            <div className={`mt-0.5 p-2 rounded-full ${
              activity.success 
                ? 'bg-emerald-500/10 text-emerald-500' 
                : 'bg-destructive/10 text-destructive'
            }`}>
              {activity.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
            </div>
            
            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">
                  {activity.success ? 'Connexion réussie' : 'Échec de connexion'}
                </span>
                <Badge variant="secondary" className="text-xs">
                  <LoginMethodIcon method={activity.login_method} />
                  <span className="ml-1">{formatLoginMethod(activity.login_method)}</span>
                </Badge>
              </div>
              
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {activity.device_info && (
                  <span className="flex items-center gap-1">
                    <Smartphone className="h-3 w-3" />
                    {activity.device_info}
                  </span>
                )}
                {activity.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {activity.location}
                  </span>
                )}
              </div>
              
              {activity.failure_reason && (
                <p className="mt-1 text-xs text-destructive">
                  {activity.failure_reason}
                </p>
              )}
              
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(activity.created_at), { 
                  addSuffix: true, 
                  locale: fr 
                })}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoginActivityCard({ limit = 5 }: { limit?: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Activité de connexion récente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LoginActivityList limit={limit} />
      </CardContent>
    </Card>
  );
}
