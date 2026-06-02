import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepProgressBar } from './StepProgressBar';

const STEPS = [
  { key: 'safety', label: 'Sécurité' },
  { key: 'evidence', label: 'Photos' },
  { key: 'location', label: 'Lieu & message' },
];

interface Props {
  step: typeof STEPS[number]['key'];
  children: ReactNode;
  onBack?: () => void;
  onClose?: () => void;
  footer?: ReactNode;
}

export function AccidentWizardLayout({ step, children, onBack, onClose, footer }: Props) {
  const navigate = useNavigate();
  const idx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="flex items-center justify-between px-2 h-14">
          <Button variant="ghost" size="icon" onClick={onBack ?? (() => navigate(-1))}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold text-base">Signaler un accident</h1>
          <Button variant="ghost" size="icon" onClick={onClose ?? (() => navigate('/driver/sinistres'))}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <StepProgressBar steps={STEPS} currentIndex={idx} />
      </header>
      <main className="flex-1 p-4 pb-32">{children}</main>
      {footer && (
        <footer className="fixed bottom-0 left-0 right-0 border-t border-border bg-card p-4 safe-bottom">
          <div className="max-w-md mx-auto">{footer}</div>
        </footer>
      )}
    </div>
  );
}

export { STEPS as WIZARD_STEPS };
