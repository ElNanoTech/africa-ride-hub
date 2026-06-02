import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Clock, XCircle, FileText } from 'lucide-react';
import { useDriverId } from '@/hooks/useDriverData';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';

interface KycGateProps {
  children: ReactNode;
}

export function KycGate({ children }: KycGateProps) {
  const { data: driverId, isLoading: isDriverIdLoading } = useDriverId();

  const { data: driverProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['driverKycStatus', driverId],
    queryFn: async () => {
      if (!driverId) return null;
      const { data, error } = await supabase
        .from('drivers')
        .select('kyc_status')
        .eq('id', driverId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });

  const { data: kycSubmission, isLoading: isKycLoading } = useQuery({
    queryKey: ['driverKycSubmission', driverId],
    queryFn: async () => {
      if (!driverId) return null;
      const { data, error } = await supabase
        .from('kyc_submissions')
        .select('id, status')
        .eq('driver_id', driverId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });

  const isLoading = isDriverIdLoading || isProfileLoading || isKycLoading;

  if (isLoading) {
    return (
      <div className="px-4 py-8">
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!driverId) {
    return <>{children}</>;
  }

  const kycStatus = driverProfile?.kyc_status;

  if (kycStatus === 'verified') {
    return <>{children}</>;
  }

  if (kycStatus === 'rejected') {
    return (
      <div className="px-4 py-8">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Vérification refusée</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Votre vérification KYC a été refusée. Veuillez soumettre à nouveau vos documents.
            </p>
            <Link to="/driver/kyc">
              <Button>
                <FileText className="h-4 w-4 mr-2" />
                Resoumettre les documents
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // pending status - check if they actually submitted
  if (kycSubmission) {
    return (
      <div className="px-4 py-8">
        <Card className="border-secondary/50 bg-secondary/5">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="h-8 w-8 text-secondary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Vérification en cours</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Vos documents sont en cours de vérification. Vous serez notifié dès que votre identité sera confirmée.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No submission yet
  return (
    <div className="px-4 py-8">
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-8 w-8 text-warning" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Vérification requise</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Vous devez compléter votre vérification KYC avant de pouvoir accéder à cette fonctionnalité.
          </p>
          <Link to="/driver/kyc">
            <Button>
              <FileText className="h-4 w-4 mr-2" />
              Compléter la vérification
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
