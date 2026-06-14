import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, HelpCircle, LifeBuoy, MessageCircle, Mic, Volume2 } from 'lucide-react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { KiraVoiceButton } from '@/components/driver/KiraVoiceButton';
import { cn } from '@/lib/utils';

const helpVoiceText =
  "Besoin d'aide ? Vous pouvez contacter votre gestionnaire, ouvrir le tutoriel, envoyer un message vocal, ou consulter les réponses rapides. Si votre problème concerne un paiement, allez dans Finance. Si votre véhicule est bloqué, allez dans Contrôle.";

const actions = [
  {
    title: 'Contacter gestionnaire',
    description: 'Ouvrir un ticket support',
    to: '/driver/support',
    icon: LifeBuoy,
  },
  {
    title: 'Message vocal',
    description: 'Parlez dans votre langue',
    to: '/driver/support',
    icon: Mic,
  },
  {
    title: 'Voir tutoriel',
    description: 'Formation et bonnes pratiques',
    to: '/driver/formation',
    icon: BookOpen,
  },
  {
    title: 'Notifications',
    description: 'Lire les derniers messages',
    to: '/driver/notifications',
    icon: MessageCircle,
  },
];

export function UniversalActionCenter({ className }: { className?: string }) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={cn(
            'fixed bottom-20 left-4 z-50 h-12 w-12 rounded-full border bg-card/95 shadow-lg backdrop-blur-xl active:scale-95',
            className,
          )}
          aria-label="Besoin d'aide"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-md rounded-t-3xl pb-6">
        <DrawerHeader className="text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle>Besoin d'aide ?</DrawerTitle>
              <DrawerDescription>
                Choisissez l'action la plus rapide.
              </DrawerDescription>
            </div>
            <KiraVoiceButton text={helpVoiceText} compact />
          </div>
        </DrawerHeader>

        <div className="px-4">
          <div className="grid gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <DrawerClose asChild key={action.title}>
                  <Link
                    to={action.to}
                    className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-3 active:bg-muted/70"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{action.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{action.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </DrawerClose>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl bg-muted/50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Volume2 className="h-4 w-4 text-primary" />
              Réponses rapides
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p><span className="font-medium text-foreground">Paiement :</span> allez dans Finance pour voir le montant exact.</p>
              <p><span className="font-medium text-foreground">Contrôle :</span> allez dans Contrôle pour envoyer ou corriger vos photos.</p>
              <p><span className="font-medium text-foreground">Crédit :</span> allez dans Finance puis Crédit pour voir ce qui manque.</p>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
