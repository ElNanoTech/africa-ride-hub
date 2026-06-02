import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">DF</span>
            </div>
            <span className="text-lg font-semibold text-foreground">DAM Flotte</span>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Retour à l'accueil
            </Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 md:py-20">
        <article className="prose prose-slate mx-auto max-w-2xl dark:prose-invert">
          <h1 className="mb-2 text-3xl font-bold text-foreground md:text-4xl">
            Conditions d'Utilisation
          </h1>
          <p className="text-sm text-muted-foreground">Dernière mise à jour : Janvier 2026</p>

          <div className="mt-8 space-y-8 text-foreground">
            <p className="text-muted-foreground">
              En utilisant DAM Flotte, vous acceptez les présentes conditions.
            </p>

            <section>
              <h2 className="mb-4 text-xl font-semibold">1. Acceptation</h2>
              <p className="text-muted-foreground">
                L'utilisation de l'application implique l'acceptation de ces conditions.
              </p>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">2. Éligibilité</h2>
              <p className="mb-2 text-muted-foreground">Pour utiliser DAM Flotte, vous devez :</p>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Être chauffeur Yango actif</li>
                <li>Avoir 18 ans ou plus</li>
                <li>Posséder un permis de conduire valide</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">3. Score de crédit</h2>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Le score est calculé hebdomadairement</li>
                <li>Le score dépend de votre conduite, paiements et activité</li>
                <li>Le score détermine votre accès aux véhicules et prêts</li>
                <li>DAM Flotte se réserve le droit de modifier l'algorithme</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">4. Locations</h2>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Les locations sont soumises à approbation</li>
                <li>Vous êtes responsable du véhicule pendant la location</li>
                <li>Tout dommage sera facturé</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">5. Prêts</h2>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>L'éligibilité dépend de votre score et historique</li>
                <li>Les prêts doivent être remboursés selon l'échéancier</li>
                <li>Les retards affectent votre score</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">6. Résiliation</h2>
              <p className="mb-2 text-muted-foreground">
                DAM Flotte peut suspendre ou résilier votre compte en cas de :
              </p>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Fraude ou fausse déclaration</li>
                <li>Non-paiement répété</li>
                <li>Violation des présentes conditions</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">7. Limitation de responsabilité</h2>
              <p className="mb-2 text-muted-foreground">
                DAM Flotte ne peut être tenu responsable des :
              </p>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Pertes indirectes</li>
                <li>Interruptions de service</li>
                <li>Décisions basées sur le score</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">8. Contact</h2>
              <p className="text-muted-foreground">
                Pour toute question : <a href="mailto:legal@damflotte.ci" className="text-primary hover:underline">legal@damflotte.ci</a>
              </p>
            </section>
          </div>

          {/* Back to Home */}
          <div className="mt-12 text-center not-prose">
            <Button asChild variant="outline" size="lg">
              <Link to="/" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour à l'accueil
              </Link>
            </Button>
          </div>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              © 2026 DAM Flotte - Côte d'Ivoire 🇨🇮
            </p>
            <nav className="flex flex-wrap justify-center gap-4 text-sm">
              <Link 
                to="/privacy" 
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Confidentialité
              </Link>
              <span className="text-muted-foreground/50">·</span>
              <Link 
                to="/terms" 
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Conditions
              </Link>
              <span className="text-muted-foreground/50">·</span>
              <Link 
                to="/support" 
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Support
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Terms;
