import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePWA } from "@/hooks/usePWA";
import { Download, Smartphone, Apple, Chrome, Share, Plus, Check, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const Install = () => {
  const { isInstallable, isInstalled, promptInstall } = usePWA();
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));
  }, []);

  const handleInstall = async () => {
    await promptInstall();
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Installer l'application DAM Flotte sur iPhone ou Android</title>
        <meta name="description" content="Installez la PWA DAM Flotte sur votre téléphone pour un accès rapide hors ligne. Instructions iOS Safari et Android Chrome." />
        <link rel="canonical" href="https://damafricahub.com/install" />
        <meta property="og:title" content="Installer DAM Flotte sur votre téléphone" />
        <meta property="og:description" content="Guide d'installation PWA DAM Flotte pour iOS et Android." />
        <meta property="og:url" content="https://damafricahub.com/install" />
      </Helmet>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/driver" aria-label="Retour à l'application" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <img src="/pwa-192x192.png" alt="DAM Flotte" className="h-8 w-8 rounded-lg" />
            <h1 className="text-lg font-semibold">Installer l'application</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-4">
            <Download className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">DAM Flotte</h2>
          <p className="text-muted-foreground">
            Installez l'application sur votre téléphone pour un accès rapide et une expérience optimale.
          </p>
        </div>

        {/* Already Installed */}
        {isInstalled && (
          <Card className="mb-6 border-primary bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Application installée</p>
                  <p className="text-sm text-muted-foreground">
                    DAM Flotte est déjà installée sur votre appareil.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Install Button */}
        {isInstallable && !isInstalled && (
          <Card className="mb-6 border-primary">
            <CardContent className="pt-6">
              <Button onClick={handleInstall} className="w-full" size="lg">
                <Download className="h-5 w-5 mr-2" />
                Installer maintenant
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Benefits */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Avantages de l'application</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/10 text-green-500">
                <Smartphone className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">Accès rapide</p>
                <p className="text-sm text-muted-foreground">
                  Lancez l'application directement depuis votre écran d'accueil.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500">
                <Download className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">Fonctionne hors ligne</p>
                <p className="text-sm text-muted-foreground">
                  Consultez vos informations même sans connexion internet.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500">
                <Check className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">Expérience native</p>
                <p className="text-sm text-muted-foreground">
                  Interface plein écran sans barre de navigateur.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* iOS Instructions */}
        <Card className={`mb-6 ${isIOS ? "border-primary" : ""}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Apple className="h-5 w-5" />
              <CardTitle className="text-lg">Sur iPhone / iPad (Safari)</CardTitle>
            </div>
            <CardDescription>Instructions pour les appareils Apple</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-sm font-medium shrink-0">
                  1
                </span>
                <div>
                  <p className="font-medium">Ouvrez Safari</p>
                  <p className="text-sm text-muted-foreground">
                    Cette fonctionnalité ne marche qu'avec Safari sur iOS.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-sm font-medium shrink-0">
                  2
                </span>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Appuyez sur</p>
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted">
                    <Share className="h-4 w-4" />
                    <span className="text-sm">Partager</span>
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-sm font-medium shrink-0">
                  3
                </span>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Sélectionnez</p>
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted">
                    <Plus className="h-4 w-4" />
                    <span className="text-sm">Sur l'écran d'accueil</span>
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-sm font-medium shrink-0">
                  4
                </span>
                <div>
                  <p className="font-medium">Appuyez sur "Ajouter"</p>
                  <p className="text-sm text-muted-foreground">
                    L'icône DAM Flotte apparaîtra sur votre écran d'accueil.
                  </p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Android Instructions */}
        <Card className={`mb-6 ${isAndroid ? "border-primary" : ""}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Chrome className="h-5 w-5" />
              <CardTitle className="text-lg">Sur Android (Chrome)</CardTitle>
            </div>
            <CardDescription>Instructions pour les appareils Android</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-sm font-medium shrink-0">
                  1
                </span>
                <div>
                  <p className="font-medium">Ouvrez Chrome</p>
                  <p className="text-sm text-muted-foreground">
                    Utilisez Google Chrome pour la meilleure expérience.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-sm font-medium shrink-0">
                  2
                </span>
                <div>
                  <p className="font-medium">Appuyez sur le menu ⋮</p>
                  <p className="text-sm text-muted-foreground">
                    Les trois points en haut à droite de l'écran.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-sm font-medium shrink-0">
                  3
                </span>
                <div>
                  <p className="font-medium">Sélectionnez "Installer l'application"</p>
                  <p className="text-sm text-muted-foreground">
                    Ou "Ajouter à l'écran d'accueil" selon votre version.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-sm font-medium shrink-0">
                  4
                </span>
                <div>
                  <p className="font-medium">Confirmez l'installation</p>
                  <p className="text-sm text-muted-foreground">
                    L'icône DAM Flotte apparaîtra sur votre écran d'accueil.
                  </p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Back to App */}
        <div className="text-center">
          <Link to="/driver">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour à l'application
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Install;
