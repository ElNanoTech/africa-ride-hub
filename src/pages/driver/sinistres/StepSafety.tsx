import { useNavigate, useParams } from 'react-router-dom';
import { Phone, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AccidentWizardLayout } from '@/components/sinistres/AccidentWizardLayout';
import { useAccident } from '@/hooks/useSinistres';

export default function StepSafety() {
  const { id } = useParams();
  const navigate = useNavigate();
  useAccident(id);

  return (
    <AccidentWizardLayout step="safety">
      <div className="max-w-md mx-auto space-y-3 pt-2">
        <Button
          size="lg"
          className="w-full h-14 text-base"
          onClick={() => navigate(`/driver/sinistres/report/${id}/evidence`)}
        >
          Continuer <ArrowRight className="h-4 w-4 ml-2" />
        </Button>

        <Card className="border-destructive/30">
          <CardContent className="p-3">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              onClick={() => (window.location.href = 'tel:170')}
            >
              <Phone className="h-5 w-5 mr-2" /> Appeler les secours (170)
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => (window.location.href = 'tel:+2250715152022')}
            >
              <Phone className="h-5 w-5 mr-2" /> Appeler Dam Africa
            </Button>
          </CardContent>
        </Card>
      </div>
    </AccidentWizardLayout>
  );
}
