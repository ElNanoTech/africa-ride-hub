import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Users, Car, CreditCard, FileText, Shield, 
  CheckCircle2, ArrowRight, ExternalLink, Copy,
  User, UserCog, ClipboardList, DollarSign,
  Activity, Bell, HeadphonesIcon, Download, Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import pptxgen from 'pptxgenjs';
import html2canvas from 'html2canvas';
import damFlotteLogo from '@/assets/dam-flotte-logo.png';

// Import screenshots
import driverLoginScreenshot from '@/assets/screenshots/driver-login.png';
import driverHomeScreenshot from '@/assets/screenshots/driver-home-mockup.png';
import driverVehiclesScreenshot from '@/assets/screenshots/driver-vehicles-mockup.png';
import driverScoreScreenshot from '@/assets/screenshots/driver-score-mockup.png';
import driverKycScreenshot from '@/assets/screenshots/driver-kyc-mockup.png';
import driverNotificationsScreenshot from '@/assets/screenshots/driver-notifications-mockup.png';
import driverSupportScreenshot from '@/assets/screenshots/driver-support-mockup.png';
import driverLoansScreenshot from '@/assets/screenshots/driver-loans-mockup.png';
import driverRentalScreenshot from '@/assets/screenshots/driver-rental-mockup.png';
import adminLoginScreenshot from '@/assets/screenshots/admin-login.png';
import adminDashboardScreenshot from '@/assets/screenshots/admin-dashboard-mockup.png';
import adminDriversScreenshot from '@/assets/screenshots/admin-drivers-mockup.png';
import adminLoansScreenshot from '@/assets/screenshots/admin-loans-mockup.png';
import adminPaymentsScreenshot from '@/assets/screenshots/admin-payments-mockup.png';
import adminRentalsScreenshot from '@/assets/screenshots/admin-rentals-mockup.png';
import adminTrackingScreenshot from '@/assets/screenshots/admin-tracking-mockup.png';
import adminAnalyticsScreenshot from '@/assets/screenshots/admin-analytics-mockup.png';
import adminSupportScreenshot from '@/assets/screenshots/admin-support-mockup.png';
import adminScoringScreenshot from '@/assets/screenshots/admin-scoring-mockup.png';

interface TestStep {
  step: number;
  actor: 'driver' | 'admin' | 'manager' | 'support';
  title: string;
  description: string;
  actions: string[];
  url: string;
  expectedResult: string;
  screenshot?: string;
}

// Map step numbers to screenshots
const STEP_SCREENSHOTS: Record<number, string> = {
  1: driverLoginScreenshot,          // Inscription Conducteur
  2: driverKycScreenshot,            // Compléter le KYC
  3: adminDriversScreenshot,         // Approuver le KYC (Admin)
  4: driverVehiclesScreenshot,       // Voir les Véhicules
  5: driverVehiclesScreenshot,       // Demander une Location
  6: adminRentalsScreenshot,         // Approuver la Location (Admin)
  7: driverRentalScreenshot,         // Voir les Paiements
  8: adminPaymentsScreenshot,        // Enregistrer un Paiement (Admin)
  9: driverScoreScreenshot,          // Consulter le Score
  10: driverLoansScreenshot,         // Demander un Prêt
  11: adminLoansScreenshot,          // Traiter la Demande de Prêt
  12: driverNotificationsScreenshot, // Voir les Notifications
  13: driverSupportScreenshot,       // Créer un Ticket de Support
  14: adminSupportScreenshot,        // Répondre au Support
  15: adminTrackingScreenshot,       // Suivi GPS
  16: adminAnalyticsScreenshot,      // Consulter les Analytics
  17: adminScoringScreenshot,        // Configurer le Scoring
};

const DRIVER_URL = '/driver/login';
const ADMIN_URL = '/admin/login';
const SETUP_URL = '/admin/setup';

const TEST_DRIVERS = [
  {
    name: 'Koné Aminata',
    phone: '+225 07 10 20 30 40',
    tier: 'A',
    score: 825,
    description: 'Conductrice exemplaire - Excellente conduite, paiements parfaits, revenus élevés',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950'
  },
  {
    name: 'Diallo Mamadou',
    phone: '+225 07 01 02 03 04',
    tier: 'B',
    score: 742,
    description: 'Bon conducteur - Bonne conduite, quelques retards mineurs',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950'
  },
  {
    name: 'Touré Ibrahim',
    phone: '+225 07 30 40 50 60',
    tier: 'C',
    score: 620,
    description: 'Conducteur moyen - Conduite à améliorer, revenus irréguliers',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950'
  },
  {
    name: 'Ouattara Sekou',
    phone: '+225 07 40 50 60 70',
    tier: 'D',
    score: 480,
    description: 'Conducteur à risque - Conduite risquée, impayés fréquents',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950'
  }
];

const TEST_CREDENTIALS = {
  driver: {
    name: 'Diallo Mamadou',
    phone: '+225 07 01 02 03 04',
    loginMethod: 'Click "Se connecter avec Yango" button'
  },
  admin: {
    email: 'naffagi@gmail.com',
    password: '(Your password)',
    role: 'Super Admin'
  }
};

const LIFECYCLE_STEPS: TestStep[] = [
  // PHASE 1: Driver Onboarding
  {
    step: 1,
    actor: 'driver',
    title: '🚗 Inscription Conducteur',
    description: 'Le conducteur se connecte pour la première fois via Yango',
    actions: [
      'Ouvrir l\'URL du login conducteur',
      'Cliquer sur le bouton orange "Se connecter avec Yango"',
      'Attendre la redirection automatique vers le tableau de bord',
      'Observer le message de bienvenue "Bonjour/Bonsoir"'
    ],
    url: DRIVER_URL,
    expectedResult: 'Le conducteur est connecté et voit son tableau de bord avec son score de crédit initial'
  },
  {
    step: 2,
    actor: 'driver',
    title: '📄 Compléter le KYC',
    description: 'Le conducteur soumet ses documents d\'identité',
    actions: [
      'Cliquer sur "Profil" dans la barre de navigation en bas',
      'Cliquer sur le bouton "Compléter le KYC"',
      'Télécharger une pièce d\'identité (carte nationale ou passeport)',
      'Télécharger le permis de conduire',
      'Entrer les informations bancaires',
      'Cliquer sur "Soumettre"'
    ],
    url: '/driver/kyc',
    expectedResult: 'Le statut KYC passe à "En attente de vérification"'
  },
  {
    step: 3,
    actor: 'admin',
    title: '✅ Approuver le KYC (Admin)',
    description: 'L\'administrateur vérifie et approuve les documents',
    actions: [
      'Se connecter à l\'espace admin',
      'Aller dans "Conducteurs" dans le menu',
      'Cliquer sur le conducteur "Diallo Mamadou"',
      'Examiner les documents soumis',
      'Cliquer sur "Approuver KYC" ou "Rejeter"'
    ],
    url: '/admin/drivers',
    expectedResult: 'Le statut KYC du conducteur passe à "Vérifié"'
  },
  // PHASE 2: Vehicle Rental
  {
    step: 4,
    actor: 'driver',
    title: '🚘 Voir les Véhicules Disponibles',
    description: 'Le conducteur explore les véhicules à louer',
    actions: [
      'Cliquer sur "Véhicules" dans la barre de navigation',
      'Parcourir la liste des véhicules disponibles',
      'Utiliser les filtres pour voir les voitures ou motos',
      'Cliquer sur le cœur pour ajouter aux favoris'
    ],
    url: '/driver/vehicles',
    expectedResult: 'Liste des véhicules disponibles avec prix journalier'
  },
  {
    step: 5,
    actor: 'driver',
    title: '📝 Demander une Location',
    description: 'Le conducteur soumet une demande de location',
    actions: [
      'Sélectionner un véhicule',
      'Cliquer sur "Louer ce véhicule"',
      'Confirmer la demande (location à la journée)'
    ],
    url: '/driver/vehicles',
    expectedResult: 'La demande de location est créée avec le statut "En attente"'
  },
  {
    step: 6,
    actor: 'admin',
    title: '🔑 Approuver la Location (Admin)',
    description: 'L\'administrateur approuve la demande de location',
    actions: [
      'Aller dans "Locations" dans le menu admin',
      'Trouver la demande de Diallo Mamadou',
      'Cliquer sur les trois points (⋮) puis "Approuver"',
      'Confirmer l\'approbation'
    ],
    url: '/admin/rentals',
    expectedResult: 'La location passe à "Active" et le véhicule est assigné'
  },
  // PHASE 3: Daily Operations & Payments
  {
    step: 7,
    actor: 'driver',
    title: '💰 Voir les Paiements à Effectuer',
    description: 'Le conducteur consulte ses paiements de location',
    actions: [
      'Cliquer sur "Location" dans la barre de navigation',
      'Voir le véhicule actuel et les détails',
      'Voir les paiements dus'
    ],
    url: '/driver/rental',
    expectedResult: 'Affichage du véhicule actuel et des paiements à venir'
  },
  {
    step: 8,
    actor: 'admin',
    title: '💳 Enregistrer un Paiement (Admin)',
    description: 'L\'admin enregistre un paiement reçu via Wave',
    actions: [
      'Aller dans "Paiements" dans le menu admin',
      'Trouver le paiement de location de Diallo',
      'Cliquer sur "Marquer comme payé"',
      'Entrer l\'ID de transaction Wave (optionnel)',
      'Confirmer le paiement'
    ],
    url: '/admin/payments',
    expectedResult: 'Le paiement est marqué comme "Payé" avec la date'
  },
  // PHASE 4: Credit Score & Loans
  {
    step: 9,
    actor: 'driver',
    title: '📊 Consulter le Score de Crédit',
    description: 'Le conducteur vérifie son score et son évolution',
    actions: [
      'Cliquer sur "Score" dans la barre de navigation',
      'Voir le score actuel et le tier (A, B, C, D)',
      'Consulter la répartition (conduite, revenus, paiements)',
      'Voir l\'historique des scores passés'
    ],
    url: '/driver/score',
    expectedResult: 'Affichage du score de crédit avec détails et conseils'
  },
  {
    step: 10,
    actor: 'driver',
    title: '🏦 Demander un Prêt',
    description: 'Le conducteur soumet une demande de prêt',
    actions: [
      'Cliquer sur "Prêts" dans la barre de navigation',
      'Cliquer sur "Demander un prêt"',
      'Choisir le type de prêt (personnel, urgence, moto)',
      'Entrer le montant souhaité',
      'Soumettre la demande'
    ],
    url: '/driver/loans',
    expectedResult: 'La demande de prêt est créée avec le statut "En attente"'
  },
  {
    step: 11,
    actor: 'admin',
    title: '💵 Traiter la Demande de Prêt (Admin)',
    description: 'L\'agent de prêt examine et approuve le prêt',
    actions: [
      'Aller dans "Prêts" dans le menu admin',
      'Trouver la demande de Diallo Mamadou',
      'Examiner le score de crédit et l\'historique',
      'Cliquer sur "Approuver" avec le montant et le taux',
      'OU cliquer sur "Rejeter" avec une raison'
    ],
    url: '/admin/loans',
    expectedResult: 'Le prêt est approuvé/rejeté et le conducteur reçoit une notification'
  },
  // PHASE 5: Support & Notifications
  {
    step: 12,
    actor: 'driver',
    title: '🔔 Voir les Notifications',
    description: 'Le conducteur consulte ses notifications',
    actions: [
      'Cliquer sur l\'icône de cloche en haut à droite',
      'Voir toutes les notifications (paiements, prêts, rappels)',
      'Cliquer sur une notification pour la marquer comme lue'
    ],
    url: '/driver/notifications',
    expectedResult: 'Liste des notifications avec statut lu/non-lu'
  },
  {
    step: 13,
    actor: 'driver',
    title: '🆘 Créer un Ticket de Support',
    description: 'Le conducteur a un problème et contacte le support',
    actions: [
      'Cliquer sur "Support" dans le profil ou la navigation',
      'Cliquer sur "Nouveau ticket"',
      'Choisir la catégorie (véhicule, paiement, technique...)',
      'Décrire le problème',
      'Soumettre le ticket'
    ],
    url: '/driver/support',
    expectedResult: 'Un ticket de support est créé avec un numéro'
  },
  {
    step: 14,
    actor: 'admin',
    title: '💬 Répondre au Support (Admin)',
    description: 'L\'agent support répond au ticket',
    actions: [
      'Aller dans "Support" dans le menu admin',
      'Trouver le ticket de Diallo Mamadou',
      'Cliquer pour ouvrir le ticket',
      'Écrire une réponse',
      'Mettre à jour le statut (En cours, Résolu)'
    ],
    url: '/admin/support',
    expectedResult: 'Le conducteur reçoit une notification avec la réponse'
  },
  // PHASE 6: Admin Analytics & Config
  {
    step: 15,
    actor: 'admin',
    title: '🗺️ Suivi GPS en Temps Réel',
    description: 'L\'admin visualise la position des véhicules sur la carte',
    actions: [
      'Aller dans "Suivi GPS" dans le menu admin',
      'Observer la carte avec les véhicules en mouvement',
      'Cliquer sur un véhicule pour voir ses détails',
      'Filtrer par statut (en mouvement, arrêté, hors ligne)',
      'Vérifier la vitesse et le niveau de carburant'
    ],
    url: '/admin/tracking',
    expectedResult: 'Carte interactive avec positions GPS simulées des 4 conducteurs test'
  },
  {
    step: 16,
    actor: 'admin',
    title: '📈 Consulter les Analytics',
    description: 'L\'admin analyse les métriques de la plateforme',
    actions: [
      'Aller dans "Analytics" dans le menu admin',
      'Voir le tableau de bord avec les KPIs',
      'Filtrer par période (semaine, mois)',
      'Exporter les rapports si nécessaire'
    ],
    url: '/admin/analytics',
    expectedResult: 'Affichage des statistiques (conducteurs, revenus, prêts)'
  },
  {
    step: 17,
    actor: 'admin',
    title: '⚙️ Configurer le Scoring',
    description: 'Le super admin ajuste les paramètres de scoring',
    actions: [
      'Aller dans "Scoring" dans le menu admin',
      'Modifier les poids des facteurs (conduite, paiements, revenus)',
      'Ajuster les seuils des tiers (A, B, C, D)',
      'Sauvegarder les modifications'
    ],
    url: '/admin/scoring',
    expectedResult: 'Les paramètres de scoring sont mis à jour'
  }
];

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success('Copié dans le presse-papiers!');
};

const ActorBadge = ({ actor }: { actor: string }) => {
  const colors = {
    driver: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    support: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
  };
  const labels = {
    driver: '🚗 Conducteur',
    admin: '👨‍💼 Admin',
    manager: '📊 Manager',
    support: '💬 Support'
  };
  return (
    <Badge className={colors[actor as keyof typeof colors]}>
      {labels[actor as keyof typeof labels]}
    </Badge>
  );
};

export default function TestGuide() {
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingPPTX, setIsExportingPPTX] = useState(false);

  // Helper function to load image as base64
  const loadImageAsBase64 = (src: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(new Error('Could not get canvas context'));
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = src;
    });
  };

  const exportToPDF = async () => {
    setIsExportingPDF(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;

      // Hide export buttons during capture
      const exportButtons = document.querySelector('.fixed.top-4.right-4') as HTMLElement;
      if (exportButtons) exportButtons.style.display = 'none';

      // Get the main content container
      const contentElement = document.querySelector('.max-w-4xl') as HTMLElement;
      if (!contentElement) throw new Error('Content not found');

      // Capture the entire page content
      const canvas = await html2canvas(contentElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 896, // max-w-4xl = 896px
      });

      // Restore export buttons
      if (exportButtons) exportButtons.style.display = 'flex';

      // Calculate dimensions to fit content across multiple pages
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const totalPages = Math.ceil(imgHeight / (pageHeight - margin * 2));

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        
        // Calculate source and destination coordinates
        const sourceY = page * ((canvas.height * (pageHeight - margin * 2)) / imgHeight);
        const sourceHeight = (canvas.height * (pageHeight - margin * 2)) / imgHeight;
        
        // Create a temporary canvas for this page slice
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.min(sourceHeight, canvas.height - sourceY);
        const ctx = pageCanvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, sourceY,
            canvas.width, pageCanvas.height,
            0, 0,
            canvas.width, pageCanvas.height
          );
          
          const pageImgData = pageCanvas.toDataURL('image/png');
          const destHeight = (pageCanvas.height * imgWidth) / canvas.width;
          pdf.addImage(pageImgData, 'PNG', margin, margin, imgWidth, destHeight, undefined, 'FAST');
        }
      }

      pdf.save('DAM-Flotte-Guide-Test.pdf');
      toast.success('PDF téléchargé avec succès!');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erreur lors de l\'export PDF');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const exportToPPTX = async () => {
    setIsExportingPPTX(true);
    try {
      const pptx = new pptxgen();
      pptx.title = 'Guide de Test DAM Flotte';
      pptx.author = 'DAM Flotte';

      // Hide export buttons during capture
      const exportButtons = document.querySelector('.fixed.top-4.right-4') as HTMLElement;
      if (exportButtons) exportButtons.style.display = 'none';

      // Get the main content container
      const contentElement = document.querySelector('.max-w-4xl') as HTMLElement;
      if (!contentElement) throw new Error('Content not found');

      // Get all cards/sections for individual slides
      const cards = contentElement.querySelectorAll(':scope > *');
      
      // Title Slide
      const titleSlide = pptx.addSlide();
      titleSlide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: '100%', h: '100%',
        fill: { color: 'F97316' }
      });
      titleSlide.addText('Guide de Test\nDAM Flotte', {
        x: 0.5, y: 2, w: 9, h: 2,
        fontSize: 44, bold: true, color: 'FFFFFF',
        align: 'center', valign: 'middle'
      });
      titleSlide.addText('Guide complet pour tester l\'application', {
        x: 0.5, y: 4.2, w: 9, h: 0.5,
        fontSize: 18, color: 'FFFFFF',
        align: 'center'
      });

      // Capture each section as a slide
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i] as HTMLElement;
        
        // Skip very small elements or separators
        if (card.offsetHeight < 50) continue;
        
        try {
          const canvas = await html2canvas(card, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
          });
          
          const imgData = canvas.toDataURL('image/png');
          const slide = pptx.addSlide();
          
          // Calculate dimensions to fit slide (10" x 5.63" usable area)
          const maxWidth = 9.5;
          const maxHeight = 5;
          const aspectRatio = canvas.width / canvas.height;
          
          let imgWidth = maxWidth;
          let imgHeight = imgWidth / aspectRatio;
          
          if (imgHeight > maxHeight) {
            imgHeight = maxHeight;
            imgWidth = imgHeight * aspectRatio;
          }
          
          // Center the image
          const xPos = (10 - imgWidth) / 2;
          const yPos = (5.63 - imgHeight) / 2;
          
          slide.addImage({
            data: imgData,
            x: xPos,
            y: yPos,
            w: imgWidth,
            h: imgHeight,
          });
        } catch (e) {
          console.warn(`Failed to capture section ${i}`);
        }
      }

      // Restore export buttons
      if (exportButtons) exportButtons.style.display = 'flex';

      // Thank You Slide
      const endSlide = pptx.addSlide();
      endSlide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: '100%', h: '100%',
        fill: { color: 'F97316' }
      });
      endSlide.addText('Félicitations!', {
        x: 0.5, y: 2, w: 9, h: 1,
        fontSize: 44, bold: true, color: 'FFFFFF',
        align: 'center'
      });
      endSlide.addText('Vous avez couvert l\'ensemble du cycle de vie\nde l\'application DAM Flotte', {
        x: 0.5, y: 3.2, w: 9, h: 1,
        fontSize: 18, color: 'FFFFFF',
        align: 'center'
      });

      await pptx.writeFile({ fileName: 'DAM-Flotte-Guide-Test.pptx' });
      toast.success('PowerPoint téléchargé avec succès!');
    } catch (error) {
      console.error('Error exporting PPTX:', error);
      toast.error('Erreur lors de l\'export PowerPoint');
    } finally {
      setIsExportingPPTX(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Fixed Export Buttons */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <Button 
          onClick={exportToPDF} 
          disabled={isExportingPDF}
          variant="outline"
          className="bg-background shadow-lg"
        >
          {isExportingPDF ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          PDF
        </Button>
        <Button 
          onClick={exportToPPTX} 
          disabled={isExportingPPTX}
          className="shadow-lg"
        >
          {isExportingPPTX ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          PPTX
        </Button>
      </div>

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <img 
            src={damFlotteLogo} 
            alt="DAM Flotte" 
            className="w-16 h-16 mx-auto rounded-xl shadow-lg"
          />
          <h1 className="text-3xl font-bold">📋 Guide de Test DAM Flotte</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Ce guide vous permet de tester l'ensemble du cycle de vie de l'application, 
            de l'inscription du conducteur jusqu'à la gestion des prêts.
          </p>
        </div>

        {/* Quick Links */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5" />
              🔗 Liens Rapides d'Accès
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                Espace Conducteur
              </h4>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-sm">
                  /driver/login
                </code>
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(window.location.origin + '/driver/login')}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" asChild>
                  <Link to="/driver/login">
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <UserCog className="w-4 h-4 text-purple-600" />
                Espace Admin
              </h4>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-sm">
                  /admin/login
                </code>
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(window.location.origin + '/admin/login')}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" asChild>
                  <Link to="/admin/login">
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" />
                Création Admin Initial
              </h4>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-sm">
                  /admin/setup
                </code>
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(window.location.origin + '/admin/setup')}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" asChild>
                  <Link to="/admin/setup">
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-orange-600" />
                Tableau de Bord Conducteur
              </h4>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-sm">
                  /driver-dashboard
                </code>
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(window.location.origin + '/driver-dashboard')}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Drivers by Tier */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              🎯 Conducteurs Test par Tier de Crédit
            </CardTitle>
            <CardDescription>
              4 conducteurs avec différents profils de score pour tester tous les scénarios
            </CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            {TEST_DRIVERS.map((driver) => (
              <div key={driver.name} className={`p-4 rounded-lg ${driver.bgColor}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`font-semibold ${driver.color}`}>{driver.name}</h4>
                  <Badge className={driver.color}>
                    Tier {driver.tier} • {driver.score}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{driver.description}</p>
                <p className="text-xs"><strong>Tél:</strong> {driver.phone}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Admin Credentials */}
        <Card className="border-2 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-600" />
              🔐 Connexion Admin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-sm">
              <p><strong>Email:</strong> {TEST_CREDENTIALS.admin.email}</p>
              <p><strong>Mot de passe:</strong> {TEST_CREDENTIALS.admin.password}</p>
              <p><strong>Rôle:</strong> {TEST_CREDENTIALS.admin.role}</p>
              <p className="text-muted-foreground italic">
                💡 Si pas de compte admin, utilisez /admin/setup pour en créer un
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardHeader>
            <CardTitle>🎭 Légende des Acteurs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <ActorBadge actor="driver" />
            <ActorBadge actor="admin" />
            <Badge className="bg-muted">Chaque étape indique qui doit la réaliser</Badge>
          </CardContent>
        </Card>

        <Separator className="my-8" />

        {/* Test Steps */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6" />
            📝 Étapes de Test Complètes
          </h2>
          
          {LIFECYCLE_STEPS.map((step, index) => (
            <Card key={step.step} className="overflow-hidden">
              <CardHeader className="bg-muted/50">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-full font-bold">
                      {step.step}
                    </span>
                    <div>
                      <CardTitle className="text-lg">{step.title}</CardTitle>
                      <CardDescription>{step.description}</CardDescription>
                    </div>
                  </div>
                  <ActorBadge actor={step.actor} />
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-primary" />
                    Actions à réaliser:
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                    {step.actions.map((action, i) => (
                      <li key={i} className="pl-2">{action}</li>
                    ))}
                  </ol>
                </div>
                
                <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-background rounded text-xs">
                      {step.url}
                    </code>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => copyToClipboard(window.location.origin + step.url)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={step.url}>
                      Ouvrir <ExternalLink className="w-3 h-3 ml-1" />
                    </Link>
                  </Button>
                </div>
                
                <div className="flex items-start gap-2 text-sm bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Résultat attendu:</strong> {step.expectedResult}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10">
          <CardContent className="pt-6 text-center space-y-4">
            <h3 className="text-xl font-bold">🎉 Félicitations!</h3>
            <p className="text-muted-foreground">
              Si vous avez suivi toutes les étapes, vous avez testé l'ensemble du cycle de vie de DAM Flotte.
            </p>
            <div className="flex justify-center gap-4">
              <Button asChild>
                <Link to="/driver/login">
                  Commencer le Test Conducteur
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admin/login">
                  Accéder à l'Admin
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
