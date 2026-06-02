import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Mail, Phone, MessageCircle, ChevronDown } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const Support = () => {
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
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Support DAM Flotte
          </h1>
          <p className="mb-10 text-lg text-muted-foreground">
            Besoin d'aide ? Notre équipe est là pour vous.
          </p>

          {/* Contact Methods */}
          <div className="mb-12 grid gap-4 sm:grid-cols-3">
            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="flex flex-col items-center p-6 text-center">
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-1 font-semibold text-foreground">Email</h3>
                <a 
                  href="mailto:support@damflotte.ci" 
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  support@damflotte.ci
                </a>
              </CardContent>
            </Card>

            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="flex flex-col items-center p-6 text-center">
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-1 font-semibold text-foreground">Téléphone</h3>
                <p className="text-sm text-muted-foreground">+225 XX XX XX XX XX</p>
                <p className="text-xs text-muted-foreground">Lun - Ven, 8h - 18h</p>
              </CardContent>
            </Card>

            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="flex flex-col items-center p-6 text-center">
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <MessageCircle className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-1 font-semibold text-foreground">WhatsApp</h3>
                <p className="text-sm text-muted-foreground">+225 XX XX XX XX XX</p>
              </CardContent>
            </Card>
          </div>

          {/* FAQ Section */}
          <div className="mb-12">
            <h2 className="mb-6 text-xl font-semibold text-foreground">Questions fréquentes</h2>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-left">
                  Comment me connecter ?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Vous devez être chauffeur Yango. Utilisez vos identifiants Yango pour vous connecter.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger className="text-left">
                  Comment améliorer mon score ?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Conduisez prudemment, effectuez vos paiements à temps, et restez actif.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger className="text-left">
                  Comment contacter mon gestionnaire ?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Créez un ticket depuis l'application dans la section Support.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Back to Home */}
          <div className="text-center">
            <Button asChild variant="outline" size="lg">
              <Link to="/" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour à l'accueil
              </Link>
            </Button>
          </div>
        </div>
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

export default Support;
