import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Car, Zap, RotateCcw, ShieldAlert, Hammer, Wrench, Flame, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AccidentWizardLayout } from '@/components/sinistres/AccidentWizardLayout';
import { useAccident, useUpdateAccident } from '@/hooks/useSinistres';
import { INCIDENT_TYPE_LABELS_FR, IncidentType } from '@/lib/sinistres';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';

const OPTIONS: { value: IncidentType; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'COLLISION', icon: Car },
  { value: 'SCRAPE', icon: Zap },
  { value: 'ROLLOVER', icon: RotateCcw },
  { value: 'THEFT', icon: ShieldAlert },
  { value: 'VANDALISM', icon: Hammer },
  { value: 'BREAKDOWN', icon: Wrench },
  { value: 'FIRE', icon: Flame },
  { value: 'OTHER', icon: HelpCircle },
];

export default function StepType() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: accident } = useAccident(id);
  const update = useUpdateAccident();
  const [selected, setSelected] = useState<IncidentType | null>(null);

  useEffect(() => {
    if (accident?.incident_type) setSelected(accident.incident_type as IncidentType);
  }, [accident?.incident_type]);

  const handleContinue = async () => {
    if (!id || !selected) return;
    try {
      await update.mutateAsync({ id, patch: { incident_type: selected } as any });
      navigate(`/driver/sinistres/report/${id}/safety`);
    } catch (e: any) {
      toast.error('Erreur', { description: e.message });
    }
  };

  return (
    <AccidentWizardLayout
      step="type"
      footer={
        <Button
          size="lg"
          className="w-full h-14 text-base"
          onClick={handleContinue}
          disabled={!selected || update.isPending}
        >
          Continuer <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      }
    >
      <div className="max-w-md mx-auto space-y-4">
        <div className="text-center pt-2">
          <h2 className="text-xl font-bold">Que s'est-il passé ?</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Choisissez le type d'incident pour adapter la suite.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {OPTIONS.map(({ value, icon: Icon }) => {
            const active = selected === value;
            return (
              <Card
                key={value}
                onClick={() => setSelected(value)}
                className={cn(
                  'cursor-pointer transition-all active:scale-95',
                  active
                    ? 'border-primary ring-2 ring-primary bg-primary/5'
                    : 'border-border hover:border-primary/40',
                )}
              >
                <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center min-h-[112px]">
                  <Icon className={cn('h-8 w-8', active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className={cn('text-sm font-medium', active && 'text-primary')}>
                    {INCIDENT_TYPE_LABELS_FR[value]}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AccidentWizardLayout>
  );
}