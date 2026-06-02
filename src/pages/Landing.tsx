import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Play } from 'lucide-react';
import damFlotteLogo from '@/assets/dam-flotte-logo.png';
import { useDemoMode, useDemoModeEnabled } from '@/hooks/useDemoMode';
const Landing = () => {
  const { showDriverDemo } = useDemoMode();
  const { isEnabled: isDemoEnabled } = useDemoModeEnabled();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img 
              src={damFlotteLogo} 
              alt="DAM Flotte" 
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-contain"
            />
            <span className="text-lg font-semibold text-foreground">DAM Flotte</span>
          </div>
          <div className="flex items-center gap-2">
            {import.meta.env.DEV && isDemoEnabled && (
              <Button variant="outline" size="sm" onClick={showDriverDemo} className="gap-2">
                <Play className="h-4 w-4" />
                Démo
              </Button>
            )}
            {import.meta.env.DEV && (
              <Button asChild variant="outline" size="sm">
                <Link to="/test-guide" className="gap-2">
                  📋 Guide de Test
                </Link>
              </Button>
            )}
            <Button asChild variant="default" size="sm">
              <Link to="/login" className="gap-2">
                Connexion Chauffeur
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero opacity-5" />
        <div className="container mx-auto px-4 py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            {/* Animated Logo with Subtle Glow */}
            <div className="relative mb-8 animate-fade-in-up">
              <div className="relative mx-auto h-28 w-28 animate-float md:h-36 md:w-36">
                {/* Subtle Glow Halo */}
                <div className="absolute -inset-3 rounded-3xl bg-primary/15 blur-xl" />
                {/* Logo */}
                <img 
                  src={damFlotteLogo} 
                  alt="DAM Flotte" 
                  width={112}
                  height={112}
                  loading="eager"
                  fetchPriority="high"
                  className="relative z-10 h-full w-full rounded-2xl object-contain shadow-xl"
                />
              </div>
            </div>
            
            <h1 className="mb-6 animate-fade-in-up text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl stagger-1">
              DAM Flotte
            </h1>
            <p className="mb-4 animate-fade-in-up text-xl font-medium text-foreground/90 md:text-2xl stagger-2">
              La plateforme intelligente pour la gestion des conducteurs et de la confiance.
            </p>
            <div className="flex animate-fade-in-up flex-col items-center gap-4 stagger-4">
              <Button asChild size="lg" className="w-full max-w-sm text-base font-semibold shadow-lg transition-transform hover:scale-105">
                <Link to="/login" className="gap-2">
                  Accéder à l'application
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Link 
                to="/admin/login" 
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Espace équipe (Admin)
              </Link>
            </div>
          </div>
        </div>
      </section>

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

export default Landing;
