import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useIsFeatureEnabled } from '@/hooks/useFeatureFlags';
import DemoMode from '@/components/DemoMode';

// Demo steps for Driver App
const DRIVER_DEMO_STEPS = [
  {
    id: 'driver-home',
    title: 'Tableau de bord',
    description: 'Accédez à votre tableau de bord personnalisé avec votre score de crédit, vos notifications et vos actions rapides.',
    image: '/src/assets/screenshots/driver-home-mockup.png',
    route: '/driver-dashboard',
  },
  {
    id: 'driver-score',
    title: 'Score de crédit',
    description: 'Suivez votre score DAM Score qui évolue chaque semaine basé sur vos revenus, paiements et comportement de conduite.',
    image: '/src/assets/screenshots/driver-score-mockup.png',
    route: '/driver/score',
  },
  {
    id: 'driver-vehicles',
    title: 'Catalogue véhicules',
    description: 'Parcourez les véhicules disponibles, comparez les tarifs et faites une demande de location en quelques clics.',
    image: '/src/assets/screenshots/driver-vehicles-mockup.png',
    route: '/driver/vehicles',
  },
  {
    id: 'driver-rental',
    title: 'Mes locations',
    description: 'Gérez vos locations actives, consultez l\'historique de vos paiements et les détails de votre contrat.',
    image: '/src/assets/screenshots/driver-rental-mockup.png',
    route: '/driver/rental',
  },
  {
    id: 'driver-loans',
    title: 'Prêts',
    description: 'Accédez à des microcrédits basés sur votre score. Plus votre score est élevé, meilleures sont les conditions.',
    image: '/src/assets/screenshots/driver-loans-mockup.png',
    route: '/driver/loans',
  },
  {
    id: 'driver-kyc',
    title: 'Vérification KYC',
    description: 'Complétez votre vérification d\'identité pour débloquer toutes les fonctionnalités de l\'application.',
    image: '/src/assets/screenshots/driver-kyc-mockup.png',
    route: '/driver/kyc',
  },
];

// Demo steps for Admin Panel
const ADMIN_DEMO_STEPS = [
  {
    id: 'admin-dashboard',
    title: 'Tableau de bord Admin',
    description: 'Vue d\'ensemble de votre flotte avec les KPIs essentiels: revenus, conducteurs actifs, véhicules et prêts.',
    image: '/src/assets/screenshots/admin-dashboard-mockup.png',
    route: '/admin',
  },
  {
    id: 'admin-drivers',
    title: 'Gestion des conducteurs',
    description: 'Visualisez, filtrez et gérez tous vos conducteurs. Suivez leur statut KYC et leurs performances.',
    image: '/src/assets/screenshots/admin-drivers-mockup.png',
    route: '/admin/drivers',
  },
  {
    id: 'admin-rentals',
    title: 'Locations',
    description: 'Gérez les demandes de location, approuvez ou refusez les candidatures et suivez les contrats actifs.',
    image: '/src/assets/screenshots/admin-rentals-mockup.png',
    route: '/admin/rentals',
  },
  {
    id: 'admin-payments',
    title: 'Paiements',
    description: 'Suivez tous les paiements, identifiez les retards et gérez les relances automatiques.',
    image: '/src/assets/screenshots/admin-payments-mockup.png',
    route: '/admin/payments',
  },
  {
    id: 'admin-loans',
    title: 'Gestion des prêts',
    description: 'Examinez les demandes de prêt, consultez les scores de crédit et gérez les remboursements.',
    image: '/src/assets/screenshots/admin-loans-mockup.png',
    route: '/admin/loans',
  },
  {
    id: 'admin-scoring',
    title: 'Configuration du scoring',
    description: 'Personnalisez les paramètres du DAM Score: poids des facteurs, seuils des tiers et règles de calcul.',
    image: '/src/assets/screenshots/admin-scoring-mockup.png',
    route: '/admin/scoring',
  },
  {
    id: 'admin-tracking',
    title: 'Tracking GPS',
    description: 'Suivez en temps réel la position de tous vos véhicules équipés de trackers Uffizio.',
    image: '/src/assets/screenshots/admin-tracking-mockup.png',
    route: '/admin/tracking',
  },
  {
    id: 'admin-analytics',
    title: 'Analytics',
    description: 'Analysez les tendances, exportez des rapports et prenez des décisions basées sur les données.',
    image: '/src/assets/screenshots/admin-analytics-mockup.png',
    route: '/admin/analytics',
  },
];

interface DemoContextType {
  isDemoMode: boolean;
  showDriverDemo: () => void;
  showAdminDemo: () => void;
  hideDemo: () => void;
  demoType: 'driver' | 'admin' | null;
}

const DemoContext = createContext<DemoContextType>({
  isDemoMode: false,
  showDriverDemo: () => {},
  showAdminDemo: () => {},
  hideDemo: () => {},
  demoType: null,
});

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demoType, setDemoType] = useState<'driver' | 'admin' | null>(null);
  const { data: isDemoEnabled } = useIsFeatureEnabled('demo_mode');

  const showDriverDemo = () => setDemoType('driver');
  const showAdminDemo = () => setDemoType('admin');
  const hideDemo = () => setDemoType(null);

  const isDemoMode = demoType !== null;

  return (
    <DemoContext.Provider value={{ isDemoMode, showDriverDemo, showAdminDemo, hideDemo, demoType }}>
      {children}
      {isDemoMode && (
        <DemoMode
          steps={demoType === 'driver' ? DRIVER_DEMO_STEPS : ADMIN_DEMO_STEPS}
          onClose={hideDemo}
        />
      )}
    </DemoContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoContext);
}

/**
 * Hook to check if demo mode feature flag is enabled
 */
export function useDemoModeEnabled() {
  const { data: isEnabled, isLoading } = useIsFeatureEnabled('demo_mode');
  return { isEnabled: isEnabled ?? false, isLoading };
}
