import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  FileCheck, 
  FileClock, 
  FileX, 
  Clock, 
  TrendingUp, 
  Users,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { useKycSubmissions } from '@/hooks/useAdminData';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface KycAnalyticsProps {
  onFilterPending?: () => void;
}

export function KycAnalytics({ onFilterPending }: KycAnalyticsProps) {
  const { data: kycSubmissions, isLoading } = useKycSubmissions();

  const analytics = useMemo(() => {
    if (!kycSubmissions || kycSubmissions.length === 0) {
      return {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        approvalRate: 0,
        rejectionRate: 0,
        avgReviewTimeHours: 0,
        pendingPercentage: 0,
        recentSubmissions: 0,
      };
    }

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const pending = kycSubmissions.filter(k => k.status === 'pending').length;
    const approved = kycSubmissions.filter(k => k.status === 'approved' || k.status === 'verified').length;
    const rejected = kycSubmissions.filter(k => k.status === 'rejected').length;
    const total = kycSubmissions.length;
    const reviewed = approved + rejected;

    // Calculate average review time for reviewed submissions
    const reviewedSubmissions = kycSubmissions.filter(
      k => (k.status === 'approved' || k.status === 'verified' || k.status === 'rejected') && k.reviewed_at
    );
    
    let avgReviewTimeHours = 0;
    if (reviewedSubmissions.length > 0) {
      const totalReviewTime = reviewedSubmissions.reduce((acc, k) => {
        const submitted = new Date(k.submitted_at).getTime();
        const reviewed = new Date(k.reviewed_at!).getTime();
        return acc + (reviewed - submitted);
      }, 0);
      avgReviewTimeHours = Math.round((totalReviewTime / reviewedSubmissions.length) / (1000 * 60 * 60));
    }

    // Recent submissions (last 7 days)
    const recentSubmissions = kycSubmissions.filter(
      k => new Date(k.submitted_at) >= oneWeekAgo
    ).length;

    return {
      total,
      pending,
      approved,
      rejected,
      approvalRate: reviewed > 0 ? Math.round((approved / reviewed) * 100) : 0,
      rejectionRate: reviewed > 0 ? Math.round((rejected / reviewed) * 100) : 0,
      avgReviewTimeHours,
      pendingPercentage: total > 0 ? Math.round((pending / total) * 100) : 0,
      recentSubmissions,
    };
  }, [kycSubmissions]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-6">
      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className={cn(
            analytics.pending > 0 && onFilterPending && "cursor-pointer hover:border-orange-300 hover:shadow-md transition-all"
          )}
          onClick={() => analytics.pending > 0 && onFilterPending?.()}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En attente</p>
                <p className="text-2xl font-bold text-orange-600">{analytics.pending}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <FileClock className="h-5 w-5 text-orange-600" />
              </div>
            </div>
            <Progress value={analytics.pendingPercentage} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approuvés</p>
                <p className="text-2xl font-bold text-green-600">{analytics.approved}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <FileCheck className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {analytics.approvalRate}% taux d'approbation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejetés</p>
                <p className="text-2xl font-bold text-red-600">{analytics.rejected}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <FileX className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {analytics.rejectionRate}% taux de rejet
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Temps moyen</p>
                <p className="text-2xl font-bold">
                  {analytics.avgReviewTimeHours > 24 
                    ? `${Math.round(analytics.avgReviewTimeHours / 24)}j`
                    : `${analytics.avgReviewTimeHours}h`
                  }
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              pour traiter une demande
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Summary Row */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <strong>{analytics.total}</strong> soumissions totales
                </span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <strong>{analytics.recentSubmissions}</strong> cette semaine
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {analytics.pending > 0 && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "gap-1 text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-900/20",
                    onFilterPending && "cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                  )}
                  onClick={() => onFilterPending?.()}
                >
                  <AlertCircle className="h-3 w-3" />
                  {analytics.pending} à traiter
                </Badge>
              )}
              {analytics.pending === 0 && (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20">
                  <CheckCircle className="h-3 w-3" />
                  Toutes traitées
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
