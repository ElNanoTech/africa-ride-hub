import { useEffect } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertTriangle, XCircle, Shield } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/routeClient';
import { useIsFeatureEnabled } from '@/hooks/useFeatureFlags';

interface AIKycValidationProps {
  driverId: string;
  idProofUrl?: string | null;
  licenseUrl?: string | null;
  status: string;
}

interface ValidationResult {
  overall_status: 'pass' | 'warning' | 'fail';
  confidence: number;
  checks: {
    name: string;
    status: 'pass' | 'warning' | 'fail';
    detail: string;
  }[];
  summary: string;
  recommendation: 'approve' | 'review' | 'reject';
}

export function AIKycValidation({ driverId, idProofUrl, licenseUrl, status }: AIKycValidationProps) {
  const { data: isEnabled } = useIsFeatureEnabled('ai_kyc_validation');

  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-kyc-validation', driverId, idProofUrl],
    queryFn: async (): Promise<ValidationResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-kyc-validation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ driverId, idProofUrl, licenseUrl }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur');
      }
      return res.json();
    },
    enabled: !!isEnabled && status === 'pending' && !!(idProofUrl || licenseUrl),
    staleTime: 1000 * 60 * 60, // Cache 1 hour
    retry: 1,
  });

  if (!isEnabled || status !== 'pending' || (!idProofUrl && !licenseUrl)) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Pré-validation IA en cours...</span>
      </div>
    );
  }

  if (error || !data) return null;

  const statusConfig = {
    pass: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', label: 'Validé IA' },
    warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', label: 'Attention IA' },
    fail: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', label: 'Échec IA' },
  };

  const recConfig = {
    approve: { label: 'Approuver', color: 'bg-primary/10 text-primary border-primary/20' },
    review: { label: 'Vérifier manuellement', color: 'bg-warning/10 text-warning border-warning/20' },
    reject: { label: 'Rejeter', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  };

  const config = statusConfig[data.overall_status];
  const Icon = config.icon;
  const rec = recConfig[data.recommendation];

  return (
    <div className={cn('p-4 rounded-lg border space-y-3', config.bg, config.border)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Pré-validation IA</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px]', config.bg, config.color, config.border)}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
          <Badge variant="outline" className={cn('text-[10px]', rec.color)}>
            Rec: {rec.label}
          </Badge>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground">{data.summary}</p>

      {/* Checks */}
      <div className="space-y-1.5">
        {data.checks?.map((check, i) => {
          const checkConfig = statusConfig[check.status];
          const CheckIcon = checkConfig.icon;
          return (
            <div key={i} className="flex items-start gap-2">
              <CheckIcon className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', checkConfig.color)} />
              <div>
                <span className="text-xs font-medium">{check.name}</span>
                <span className="text-xs text-muted-foreground ml-1">— {check.detail}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confidence */}
      <div className="flex items-center gap-2">
        <Shield className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">
          Confiance: {Math.round(data.confidence * 100)}%
        </span>
      </div>
    </div>
  );
}
