import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useFeatureFlags, useUpdateFeatureFlag, FEATURE_TIERS, getFlagTier, CATEGORY_LABELS } from '@/hooks/useFeatureFlags';
import { useIsPlatformOwner } from '@/hooks/useFeatureFlags';
import { toast } from 'sonner';
import { 
  Check, 
  X, 
  Sparkles, 
  Zap, 
  Crown, 
  Shield,
  Bot,
  TrendingUp,
  FileSearch,
  Brain,
  Trophy,
  MapPin,
  BarChart3,
  CreditCard,
  MessageSquare,
  Link2,
  Palette,
  ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';

const TIER_CONFIG = {
  base: {
    name: 'Base',
    price: '50 000',
    period: '/mois',
    description: 'Tout ce qu\'il faut pour gérer une flotte VTC',
    icon: Zap,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/20',
    features: [
      { icon: Shield, label: 'Authentification sécurisée' },
      { icon: Check, label: 'Gestion des conducteurs' },
      { icon: CreditCard, label: 'Prêts & paiements' },
      { icon: Check, label: 'Locations & véhicules' },
      { icon: TrendingUp, label: 'DAM Score basique' },
      { icon: Check, label: 'Notifications push' },
    ],
  },
  pro: {
    name: 'Pro',
    price: '150 000',
    period: '/mois',
    description: 'Fonctionnalités avancées pour une croissance accélérée',
    icon: Sparkles,
    color: 'text-secondary',
    bgColor: 'bg-secondary/10',
    borderColor: 'border-secondary/30',
    popular: true,
    features: [
      { icon: Check, label: 'Tout le forfait Base' },
      { icon: Trophy, label: 'Gamification & classements' },
      { icon: MapPin, label: 'Suivi GPS en temps réel' },
      { icon: BarChart3, label: 'Analytiques avancées' },
      { icon: CreditCard, label: 'Finance avancée' },
      { icon: MessageSquare, label: 'Communication premium' },
      { icon: Link2, label: 'Intégrations tierces' },
      { icon: Palette, label: 'Marque blanche' },
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Sur mesure',
    period: '',
    description: 'Intelligence artificielle et support dédié',
    icon: Crown,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    features: [
      { icon: Check, label: 'Tout le forfait Pro' },
      { icon: Bot, label: 'Chatbot IA conducteur' },
      { icon: FileSearch, label: 'Validation KYC par IA' },
      { icon: TrendingUp, label: 'Insights revenus IA' },
      { icon: Brain, label: 'Assistant IA admin' },
      { icon: Shield, label: 'Support dédié 24/7' },
      { icon: Check, label: 'SLA garanti 99.9%' },
      { icon: Check, label: 'Onboarding personnalisé' },
    ],
  },
};

const AI_FEATURES = [
  {
    key: 'ai_driver_chatbot',
    icon: Bot,
    name: 'Chatbot IA Conducteur',
    description: 'Assistant conversationnel intelligent qui répond aux questions des conducteurs sur leur score, paiements et location en temps réel.',
    value: 'Réduit de 60% les tickets support',
    tier: 'enterprise',
  },
  {
    key: 'ai_kyc_validation',
    icon: FileSearch,
    name: 'Validation KYC par IA',
    description: 'Pré-validation automatique des documents d\'identité avec scoring de confiance et détection de fraude.',
    value: 'Divise par 3 le temps de traitement KYC',
    tier: 'enterprise',
  },
  {
    key: 'ai_income_insights',
    icon: TrendingUp,
    name: 'Insights Revenus IA',
    description: 'Analyse intelligente des tendances de revenus avec projections et recommandations personnalisées.',
    value: '+25% de revenus moyens pour les conducteurs',
    tier: 'enterprise',
  },
  {
    key: 'ai_admin_assistant',
    icon: Brain,
    name: 'Assistant IA Admin',
    description: 'Résumé automatique des profils conducteurs avec analyse de risque et éligibilité aux prêts.',
    value: 'Décisions 4x plus rapides',
    tier: 'enterprise',
  },
];

function TierCard({ tier, config, isCurrentTier, onSelect }: {
  tier: string;
  config: typeof TIER_CONFIG.base;
  isCurrentTier: boolean;
  onSelect: () => void;
}) {
  const Icon = config.icon;
  const isPopular = 'popular' in config && config.popular;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: tier === 'base' ? 0 : tier === 'pro' ? 0.1 : 0.2 }}
    >
      <Card className={`relative h-full flex flex-col ${isPopular ? 'border-secondary shadow-lg ring-2 ring-secondary/20' : ''} ${isCurrentTier ? 'border-primary ring-2 ring-primary/20' : ''}`}>
        {isPopular && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-secondary text-secondary-foreground shadow-md">
              <Sparkles className="h-3 w-3 mr-1" />
              Le plus populaire
            </Badge>
          </div>
        )}
        {isCurrentTier && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-primary text-primary-foreground shadow-md">
              Forfait actuel
            </Badge>
          </div>
        )}

        <CardHeader className="text-center pb-2">
          <div className={`mx-auto p-3 rounded-xl ${config.bgColor} w-fit mb-2`}>
            <Icon className={`h-6 w-6 ${config.color}`} />
          </div>
          <CardTitle className="text-xl">{config.name}</CardTitle>
          <CardDescription className="text-sm">{config.description}</CardDescription>
        </CardHeader>

        <CardContent className="flex-1">
          <div className="text-center mb-6">
            <span className="text-3xl font-bold">{config.price}</span>
            <span className="text-muted-foreground text-sm"> FCFA{config.period}</span>
          </div>

          <Separator className="mb-4" />

          <ul className="space-y-3">
            {config.features.map((feature, i) => {
              const FeatureIcon = feature.icon;
              return (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <FeatureIcon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{feature.label}</span>
                </li>
              );
            })}
          </ul>
        </CardContent>

        <CardFooter>
          <Button
            className="w-full"
            variant={isPopular ? 'hero' : isCurrentTier ? 'outline' : 'default'}
            disabled={isCurrentTier}
            onClick={onSelect}
          >
            {isCurrentTier ? 'Forfait actuel' : 'Choisir ce forfait'}
            {!isCurrentTier && <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

function AIFeatureCard({ feature, isEnabled, onToggle, canToggle }: {
  feature: typeof AI_FEATURES[0];
  isEnabled: boolean;
  onToggle: () => void;
  canToggle: boolean;
}) {
  const Icon = feature.icon;

  return (
    <Card className={`transition-all ${isEnabled ? 'border-primary/30 bg-primary/5' : ''}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-lg ${isEnabled ? 'bg-primary/15' : 'bg-muted'} flex-shrink-0`}>
            <Icon className={`h-5 w-5 ${isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h3 className="font-semibold text-sm">{feature.name}</h3>
              {canToggle && (
                <Switch checked={isEnabled} onCheckedChange={onToggle} />
              )}
              {!canToggle && (
                <Badge variant="outline" className="text-xs">
                  Enterprise
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2">{feature.description}</p>
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <TrendingUp className="h-3 w-3" />
              {feature.value}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureComparisonTable() {
  const rows = [
    { feature: 'Conducteurs & véhicules', base: true, pro: true, enterprise: true },
    { feature: 'Prêts & paiements', base: true, pro: true, enterprise: true },
    { feature: 'DAM Score basique', base: true, pro: true, enterprise: true },
    { feature: 'Notifications push', base: true, pro: true, enterprise: true },
    { feature: 'Gamification & classements', base: false, pro: true, enterprise: true },
    { feature: 'Suivi GPS temps réel', base: false, pro: true, enterprise: true },
    { feature: 'Analytiques avancées', base: false, pro: true, enterprise: true },
    { feature: 'Marque blanche', base: false, pro: true, enterprise: true },
    { feature: 'Intégrations tierces', base: false, pro: true, enterprise: true },
    { feature: 'Chatbot IA conducteur', base: false, pro: false, enterprise: true },
    { feature: 'Validation KYC par IA', base: false, pro: false, enterprise: true },
    { feature: 'Insights revenus IA', base: false, pro: false, enterprise: true },
    { feature: 'Assistant IA admin', base: false, pro: false, enterprise: true },
    { feature: 'Support dédié 24/7', base: false, pro: false, enterprise: true },
    { feature: 'SLA 99.9%', base: false, pro: false, enterprise: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Comparaison détaillée</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Fonctionnalité</th>
                <th className="text-center p-3 font-medium">Base</th>
                <th className="text-center p-3 font-medium text-secondary">Pro</th>
                <th className="text-center p-3 font-medium text-warning">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3">{row.feature}</td>
                  <td className="text-center p-3">
                    {row.base ? <Check className="h-4 w-4 text-primary mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                  </td>
                  <td className="text-center p-3">
                    {row.pro ? <Check className="h-4 w-4 text-secondary mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                  </td>
                  <td className="text-center p-3">
                    {row.enterprise ? <Check className="h-4 w-4 text-warning mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPricing() {
  const { data: flags } = useFeatureFlags();
  const { data: isPlatformOwner } = useIsPlatformOwner();
  const updateFlag = useUpdateFeatureFlag();
  const [currentTier] = useState<string>('base');

  const isFeatureEnabled = (key: string) => {
    return flags?.find(f => f.flag_key === key)?.flag_value ?? false;
  };

  const handleToggleAI = (flagKey: string) => {
    const current = isFeatureEnabled(flagKey);
    updateFlag.mutate(
      { flagKey, flagValue: !current },
      {
        onSuccess: () => toast.success(`${flagKey} ${!current ? 'activé' : 'désactivé'}`),
        onError: () => toast.error('Erreur lors de la mise à jour'),
      }
    );
  };

  const handleSelectTier = (tier: string) => {
    toast.info(`Contactez-nous pour passer au forfait ${tier}`, {
      description: 'Notre équipe vous contactera sous 24h pour configurer votre forfait.',
      action: {
        label: 'Contacter',
        onClick: () => window.open('mailto:sales@dam-africa.com?subject=Upgrade%20' + tier),
      },
    });
  };

  return (
    <AdminLayout>
      <AdminBreadcrumb
        items={[
          { label: 'Tableau de bord', href: '/admin' },
          { label: 'Tarification' },
        ]}
      />

      <AdminPageHeader
        title="Tarification & Services Premium"
        description="Choisissez le forfait adapté à votre flotte et activez les fonctionnalités IA"
      />

      {/* Tier Cards */}
      <div className="grid gap-6 md:grid-cols-3 mb-10">
        {Object.entries(TIER_CONFIG).map(([tier, config]) => (
          <TierCard
            key={tier}
            tier={tier}
            config={config}
            isCurrentTier={tier === currentTier}
            onSelect={() => handleSelectTier(tier)}
          />
        ))}
      </div>

      {/* AI Features Section */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-warning/10">
            <Brain className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Fonctionnalités IA Premium</h2>
            <p className="text-sm text-muted-foreground">
              {isPlatformOwner 
                ? 'Activez/désactivez les fonctionnalités IA pour vos clients' 
                : 'Incluses dans le forfait Enterprise'}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {AI_FEATURES.map((feature) => (
            <AIFeatureCard
              key={feature.key}
              feature={feature}
              isEnabled={isFeatureEnabled(feature.key)}
              onToggle={() => handleToggleAI(feature.key)}
              canToggle={!!isPlatformOwner}
            />
          ))}
        </div>
      </div>

      {/* Comparison Table */}
      <FeatureComparisonTable />
    </AdminLayout>
  );
}
