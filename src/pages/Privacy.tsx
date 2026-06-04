import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Politique de confidentialité — DAM Flotte</title>
        <meta name="description" content="Comment DAM Flotte collecte, utilise et protège vos données personnelles : KYC, paiements, score et droits des utilisateurs." />
        <link rel="canonical" href="https://damafricahub.com/privacy" />
        <meta property="og:title" content="Politique de confidentialité — DAM Flotte" />
        <meta property="og:description" content="Données collectées, finalités, partage et droits des conducteurs sur la plateforme DAM Flotte." />
        <meta property="og:url" content="https://damafricahub.com/privacy" />
      </Helmet>
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
            Politique de Confidentialité
          </h1>
          <p className="text-sm text-muted-foreground">Dernière mise à jour : Janvier 2026</p>

          <div className="mt-8 space-y-8 text-foreground">
            <p className="text-muted-foreground">
              DAM Flotte ("nous", "notre") s'engage à protéger la confidentialité de vos données personnelles.
            </p>

            <section>
              <h2 className="mb-4 text-xl font-semibold">1. Données collectées</h2>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Informations d'identification (nom, téléphone, email)</li>
                <li>Documents KYC (pièce d'identité, permis de conduire)</li>
                <li>Données de conduite (via Uffizio GPS)</li>
                <li>Historique de paiements</li>
                <li>Score de crédit</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">2. Utilisation des données</h2>
              <p className="mb-2 text-muted-foreground">Vos données sont utilisées pour :</p>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Vérifier votre identité</li>
                <li>Calculer votre score de crédit</li>
                <li>Gérer vos locations et prêts</li>
                <li>Améliorer nos services</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">3. Partage des données</h2>
              <p className="mb-2 text-muted-foreground">
                Nous ne vendons jamais vos données. Nous partageons uniquement avec :
              </p>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Yango (authentification)</li>
                <li>Uffizio (télémétrie véhicule)</li>
                <li>Wave (paiements)</li>
                <li>Autorités légales (si requis par la loi)</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">4. Sécurité</h2>
              <p className="mb-2 text-muted-foreground">Vos données sont protégées par :</p>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Chiffrement en transit et au repos</li>
                <li>Contrôle d'accès strict</li>
                <li>Audit des accès</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold">5. Vos droits</h2>
              <p className="mb-2 text-muted-foreground">Vous pouvez :</p>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Accéder à vos données</li>
                <li>Demander une correction</li>
                <li>Demander la suppression</li>
                <li>Retirer votre consentement</li>
              </ul>
            </section>

            <section>
              <p className="text-muted-foreground">
                Contact : <a href="mailto:privacy@damflotte.ci" className="text-primary hover:underline">privacy@damflotte.ci</a>
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

export default Privacy;
