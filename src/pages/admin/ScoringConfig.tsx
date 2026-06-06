import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Settings, Save, RotateCcw, AlertTriangle, Calculator, Banknote, Car, CreditCard, FileWarning, Info, Play, Gauge, ShieldAlert, FileText, Loader2, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { DrivingEventWeightsEditor } from '@/components/admin/DrivingEventWeightsEditor';
import { useScoringConfig, useUpdateScoringConfig } from '@/hooks/useAdminData';
import { DEFAULT_ACCIDENT_PENALTIES, normalizeAccidentPenaltyConfig } from '@/lib/accidentScoring';
import { downloadScoreAuditReport } from '@/lib/scoreAuditReport';
import { SCORE_THRESHOLDS, SCORE_SCALE } from '@/lib/scoreLevel';

// Default configuration — Phase 12: KIRA 6-factor model on 0–1000 scale
const defaultConfig = {
  weights: {
    payment_history: 25,
    driving_behavior: 25,
    income_stability: 10,
    sinistralite: 15,
    infractions: 10,
    credit: 15,
  },
  tier_thresholds: {
    platinum: SCORE_THRESHOLDS.A,
    gold: SCORE_THRESHOLDS.B,
    silver: SCORE_THRESHOLDS.C,
    bronze: SCORE_THRESHOLDS.D,
  },
  loan_limits: {
    platinum: { max_amount: 500000, max_interest: 5 },
    gold: { max_amount: 300000, max_interest: 8 },
    silver: { max_amount: 150000, max_interest: 12 },
    bronze: { max_amount: 75000, max_interest: 15 },
    onboarding: { max_amount: 0, max_interest: 0 }
  },
  rental_discounts: {
    platinum: 15,
    gold: 10,
    silver: 5,
    bronze: 0,
    onboarding: 0
  },
  accident_penalties: {
    minor: DEFAULT_ACCIDENT_PENALTIES.MINOR,
    moderate: DEFAULT_ACCIDENT_PENALTIES.MODERATE,
    severe: DEFAULT_ACCIDENT_PENALTIES.SEVERE,
  },
  payment_score_rules: {
    on_time_bonus: 5,
    late_penalty: -10,
    overdue_penalty: -20,
    enabled: true,
  },
};

export default function AdminScoringConfig() {
  const { data: persistedConfig } = useScoringConfig();
  const updateScoringConfig = useUpdateScoringConfig();
  const [config, setConfig] = useState(defaultConfig);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showRunScoringDialog, setShowRunScoringDialog] = useState(false);
  const [isRunningScoring, setIsRunningScoring] = useState(false);
  const [isExportingAudit, setIsExportingAudit] = useState(false);

  const handleExportAudit = async () => {
    setIsExportingAudit(true);
    try {
      const report = await downloadScoreAuditReport();
      const drifted = report.drivers_drifted;
      if (drifted === 0) {
        toast.success(`Audit exporté — ${report.drivers_total} conducteurs, aucun écart détecté`);
      } else {
        toast.warning(
          `Audit exporté — ${drifted} conducteur(s) en écart sur ${report.drivers_total}`,
        );
      }
    } catch (err) {
      console.error('Score audit export failed', err);
      toast.error("Échec de l'export de l'audit des scores");
    } finally {
      setIsExportingAudit(false);
    }
  };

  const totalWeight = Object.values(config.weights).reduce((a, b) => a + b, 0);
  const isWeightValid = totalWeight === 100;

  const updateWeight = (key: keyof typeof config.weights, value: number) => {
    setConfig(prev => ({
      ...prev,
      weights: { ...prev.weights, [key]: value }
    }));
    setHasChanges(true);
  };

  const updateThreshold = (key: keyof typeof config.tier_thresholds, value: number) => {
    setConfig(prev => ({
      ...prev,
      tier_thresholds: { ...prev.tier_thresholds, [key]: value }
    }));
    setHasChanges(true);
  };

  const updateLoanLimit = (tier: string, field: 'max_amount' | 'max_interest', value: number) => {
    setConfig(prev => ({
      ...prev,
      loan_limits: {
        ...prev.loan_limits,
        [tier]: { ...prev.loan_limits[tier as keyof typeof prev.loan_limits], [field]: value }
      }
    }));
    setHasChanges(true);
  };

  const updateRentalDiscount = (tier: string, value: number) => {
    setConfig(prev => ({
      ...prev,
      rental_discounts: { ...prev.rental_discounts, [tier]: value }
    }));
    setHasChanges(true);
  };

  const updateAccidentPenalty = (key: keyof typeof config.accident_penalties, value: number) => {
    setConfig(prev => ({
      ...prev,
      accident_penalties: { ...prev.accident_penalties, [key]: value > 0 ? -value : value }
    }));
    setHasChanges(true);
  };

  const updatePaymentRule = (
    key: 'on_time_bonus' | 'late_penalty' | 'overdue_penalty',
    value: number,
  ) => {
    const normalized = key === 'on_time_bonus' ? Math.max(0, value) : -Math.abs(value);
    setConfig(prev => ({
      ...prev,
      payment_score_rules: { ...prev.payment_score_rules, [key]: normalized },
    }));
    setHasChanges(true);
  };

  const updatePaymentRuleEnabled = (enabled: boolean) => {
    setConfig(prev => ({
      ...prev,
      payment_score_rules: { ...prev.payment_score_rules, enabled },
    }));
    setHasChanges(true);
  };

  useEffect(() => {
    if (!persistedConfig) return;

    const penalties = normalizeAccidentPenaltyConfig((persistedConfig as Record<string, unknown>).accident_penalties);

    setConfig(prev => ({
      ...prev,
      weights: { ...prev.weights, ...((persistedConfig as Record<string, any>).weights || {}) },
      tier_thresholds: { ...prev.tier_thresholds, ...((persistedConfig as Record<string, any>).tier_thresholds || {}) },
      loan_limits: { ...prev.loan_limits, ...((persistedConfig as Record<string, any>).loan_limits || {}) },
      rental_discounts: { ...prev.rental_discounts, ...((persistedConfig as Record<string, any>).rental_discounts || {}) },
      accident_penalties: {
        minor: penalties.MINOR,
        moderate: penalties.MODERATE,
        severe: penalties.SEVERE,
      },
      payment_score_rules: {
        ...prev.payment_score_rules,
        ...((persistedConfig as Record<string, any>).payment_score_rules || {}),
      },
    }));
  }, [persistedConfig]);

  const handleSave = () => {
    if (!isWeightValid) {
      toast.error('Les poids doivent totaliser 100%');
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmSave = async () => {
    await updateScoringConfig.mutateAsync([
      { key: 'weights', value: config.weights },
      { key: 'tier_thresholds', value: config.tier_thresholds },
      { key: 'loan_limits', value: config.loan_limits },
      { key: 'rental_discounts', value: config.rental_discounts },
      {
        key: 'accident_penalties',
        value: {
          MINOR: config.accident_penalties.minor,
          MODERATE: config.accident_penalties.moderate,
          SEVERE: config.accident_penalties.severe,
        },
      },
      { key: 'payment_score_rules', value: config.payment_score_rules },
    ]);
    setHasChanges(false);
    setShowConfirmDialog(false);
  };

  const handleReset = () => {
    setConfig(defaultConfig);
    setHasChanges(false);
    toast.info('Configuration réinitialisée');
  };

  const handleRunScoring = async () => {
    setIsRunningScoring(true);
    try {
      // Call the edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calculate-weekly-scores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(`Calcul terminé: ${result.processed} scores mis à jour`);
      } else {
        toast.error(`Erreur: ${result.error}`);
      }
    } catch (error) {
      toast.error('Erreur lors du calcul des scores');
      console.error(error);
    } finally {
      setIsRunningScoring(false);
      setShowRunScoringDialog(false);
    }
  };

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = {
      platinum: 'text-tier-a',
      gold: 'text-tier-b',
      silver: 'text-tier-c',
      bronze: 'text-tier-d',
      onboarding: 'text-tier-e',
    };
    return colors[tier] || '';
  };

  const getTierLabel = (tier: string) => {
    // Unified A/B/C/D/E naming across the app.
    const labels: Record<string, string> = {
      platinum: 'Niveau A — Excellent',
      gold: 'Niveau B — Bon',
      silver: 'Niveau C — Moyen',
      bronze: 'Niveau D — Faible',
      onboarding: 'Niveau E — Démarrage',
    };
    return labels[tier] || tier;
  };

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Configuration Scoring' }]} />
      
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Configuration Scoring</h1>
            <p className="text-muted-foreground">Paramètres du système de score de crédit</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleExportAudit}
              disabled={isExportingAudit}
              className="gap-2"
              title="Exporter un rapport PDF: base + somme des événements + score stocké + score attendu pour chaque conducteur"
            >
              {isExportingAudit ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Audit scores (PDF)
            </Button>
            <Button variant="outline" onClick={() => setShowRunScoringDialog(true)} className="gap-2">
              <Play className="h-4 w-4" />
              Lancer calcul
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={!hasChanges} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Réinitialiser
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || !isWeightValid} className="gap-2">
              <Save className="h-4 w-4" />
              Sauvegarder
            </Button>
          </div>
        </div>

        {hasChanges && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Vous avez des modifications non sauvegardées.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="weights" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="weights" className="gap-2">
              <Calculator className="h-4 w-4" />
              Poids
            </TabsTrigger>
            <TabsTrigger value="thresholds" className="gap-2">
              <Settings className="h-4 w-4" />
              Seuils
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Paiements
            </TabsTrigger>
            <TabsTrigger value="loans" className="gap-2">
              <Banknote className="h-4 w-4" />
              Prêts
            </TabsTrigger>
            <TabsTrigger value="rentals" className="gap-2">
              <Car className="h-4 w-4" />
              Locations
            </TabsTrigger>
            <TabsTrigger value="driving" className="gap-2">
              <Gauge className="h-4 w-4" />
              Conduite
            </TabsTrigger>
            <TabsTrigger value="accidents" className="gap-2">
              <ShieldAlert className="h-4 w-4" />
              Sinistres
            </TabsTrigger>
          </TabsList>

          {/* Weights Tab */}
          <TabsContent value="weights" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Pondération des facteurs</span>
                  <Badge variant={isWeightValid ? 'approved' : 'destructive'}>
                    Total: {totalWeight}%
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Les poids déterminent l'importance de chaque facteur dans le calcul du score. Le total doit être égal à 100%.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Income Stability */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-tier-gold" />
                      Stabilité des revenus
                    </Label>
                    <span className="font-medium">{config.weights.income_stability}%</span>
                  </div>
                  <Slider
                    value={[config.weights.income_stability]}
                    onValueChange={([v]) => updateWeight('income_stability', v)}
                    max={100}
                    step={5}
                    className="cursor-pointer"
                  />
                  <p className="text-sm text-muted-foreground">
                    Revenus quotidiens moyens, nombre de trajets, régularité
                  </p>
                </div>

                {/* Payment History */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Historique de paiement
                    </Label>
                    <span className="font-medium">{config.weights.payment_history}%</span>
                  </div>
                  <Slider
                    value={[config.weights.payment_history]}
                    onValueChange={([v]) => updateWeight('payment_history', v)}
                    max={100}
                    step={5}
                    className="cursor-pointer"
                  />
                  <p className="text-sm text-muted-foreground">
                    Paiements à temps, retards, paiements manqués
                  </p>
                </div>

                {/* Driving Behavior */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Car className="h-4 w-4 text-tier-silver" />
                      Comportement de conduite
                    </Label>
                    <span className="font-medium">{config.weights.driving_behavior}%</span>
                  </div>
                  <Slider
                    value={[config.weights.driving_behavior]}
                    onValueChange={([v]) => updateWeight('driving_behavior', v)}
                    max={100}
                    step={5}
                    className="cursor-pointer"
                  />
                  <p className="text-sm text-muted-foreground">
                    Freinage brusque, excès de vitesse, temps d'inactivité
                  </p>
                </div>

                {/* Tenure */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Ancienneté
                    </Label>
                    <span className="font-medium">{config.weights.tenure}%</span>
                  </div>
                  <Slider
                    value={[config.weights.tenure]}
                    onValueChange={([v]) => updateWeight('tenure', v)}
                    max={100}
                    step={5}
                    className="cursor-pointer"
                  />
                  <p className="text-sm text-muted-foreground">
                    Durée depuis l'inscription sur la plateforme
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Thresholds Tab */}
          <TabsContent value="thresholds" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Seuils de niveau</CardTitle>
                <CardDescription>
                  Définissez les scores minimum pour chaque niveau. Le score va de 300 à 900.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(config.tier_thresholds).map(([tier, threshold]) => (
                  <div key={tier} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className={`font-medium ${getTierColor(tier)}`}>
                        {getTierLabel(tier)}
                      </Label>
                      <span className="font-mono">{threshold}+</span>
                    </div>
                    <Slider
                      value={[threshold]}
                      onValueChange={([v]) => updateThreshold(tier as keyof typeof config.tier_thresholds, v)}
                      min={300}
                      max={900}
                      step={10}
                      className="cursor-pointer"
                    />
                  </div>
                ))}
                
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Visualisation des plages
                  </h4>
                  <div className="flex h-8 rounded-lg overflow-hidden">
                    <div className="bg-tier-e flex-1 flex items-center justify-center text-xs font-medium text-white">
                      E
                    </div>
                    <div className="bg-tier-d flex-1 flex items-center justify-center text-xs font-medium text-white">
                      D
                    </div>
                    <div className="bg-tier-c flex-1 flex items-center justify-center text-xs font-medium text-white">
                      C
                    </div>
                    <div className="bg-tier-b flex-1 flex items-center justify-center text-xs font-medium text-white">
                      B
                    </div>
                    <div className="bg-tier-a flex-1 flex items-center justify-center text-xs font-medium text-white">
                      A
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>300</span>
                    <span>{config.tier_thresholds.bronze}</span>
                    <span>{config.tier_thresholds.silver}</span>
                    <span>{config.tier_thresholds.gold}</span>
                    <span>{config.tier_thresholds.platinum}</span>
                    <span>900</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab — event-driven score deltas */}
          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Score selon le comportement de paiement
                  </span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="payment-rules-enabled" className="text-sm text-muted-foreground">
                      Actif
                    </Label>
                    <Switch
                      id="payment-rules-enabled"
                      checked={config.payment_score_rules.enabled}
                      onCheckedChange={updatePaymentRuleEnabled}
                    />
                  </div>
                </CardTitle>
                <CardDescription>
                  Ces règles s'appliquent automatiquement à chaque changement de statut d'un paiement
                  (location ou prêt). Le chauffeur voit l'ajustement et la raison sur sa page Score.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 font-medium text-success">
                      <CreditCard className="h-4 w-4" />
                      Paiement à temps
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-success text-sm">+</span>
                      <Input
                        type="number"
                        value={config.payment_score_rules.on_time_bonus}
                        onChange={(e) => updatePaymentRule('on_time_bonus', parseInt(e.target.value) || 0)}
                        className="w-24 text-right"
                        min={0}
                        max={50}
                        disabled={!config.payment_score_rules.enabled}
                      />
                      <span className="text-muted-foreground text-sm">pts</span>
                    </div>
                  </div>
                  <Slider
                    value={[config.payment_score_rules.on_time_bonus]}
                    onValueChange={([v]) => updatePaymentRule('on_time_bonus', v)}
                    min={0}
                    max={50}
                    step={1}
                    disabled={!config.payment_score_rules.enabled}
                    className="cursor-pointer"
                  />
                  <p className="text-sm text-muted-foreground">
                    Bonus accordé quand un paiement est réglé à la date d'échéance ou avant.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 font-medium text-warning">
                      <Clock className="h-4 w-4" />
                      Paiement en retard
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-warning text-sm">−</span>
                      <Input
                        type="number"
                        value={Math.abs(config.payment_score_rules.late_penalty)}
                        onChange={(e) => updatePaymentRule('late_penalty', parseInt(e.target.value) || 0)}
                        className="w-24 text-right"
                        min={0}
                        max={100}
                        disabled={!config.payment_score_rules.enabled}
                      />
                      <span className="text-muted-foreground text-sm">pts</span>
                    </div>
                  </div>
                  <Slider
                    value={[Math.abs(config.payment_score_rules.late_penalty)]}
                    onValueChange={([v]) => updatePaymentRule('late_penalty', v)}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!config.payment_score_rules.enabled}
                    className="cursor-pointer"
                  />
                  <p className="text-sm text-muted-foreground">
                    Pénalité appliquée quand le paiement est encaissé après la date d'échéance.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 font-medium text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Paiement en souffrance
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-destructive text-sm">−</span>
                      <Input
                        type="number"
                        value={Math.abs(config.payment_score_rules.overdue_penalty)}
                        onChange={(e) => updatePaymentRule('overdue_penalty', parseInt(e.target.value) || 0)}
                        className="w-24 text-right"
                        min={0}
                        max={200}
                        disabled={!config.payment_score_rules.enabled}
                      />
                      <span className="text-muted-foreground text-sm">pts</span>
                    </div>
                  </div>
                  <Slider
                    value={[Math.abs(config.payment_score_rules.overdue_penalty)]}
                    onValueChange={([v]) => updatePaymentRule('overdue_penalty', v)}
                    min={0}
                    max={200}
                    step={5}
                    disabled={!config.payment_score_rules.enabled}
                    className="cursor-pointer"
                  />
                  <p className="text-sm text-muted-foreground">
                    Pénalité appliquée dès qu'un paiement passe au statut "en souffrance" (impayé).
                  </p>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Ces ajustements sont automatiques et apparaissent dans la section
                    « Ajustements récents » de l'écran Score du chauffeur, avec la raison en clair.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Loans Tab */}
          <TabsContent value="loans" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Limites de prêt par niveau</CardTitle>
                <CardDescription>
                  Configurez les montants maximum et taux d'intérêt pour chaque niveau.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6">
                  {Object.entries(config.loan_limits).map(([tier, limits]) => (
                    <div key={tier} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg">
                      <div className="flex items-center">
                        <span className={`font-medium ${getTierColor(tier)}`}>
                          {getTierLabel(tier)}
                        </span>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Montant max (FCFA)</Label>
                        <Input
                          type="number"
                          value={limits.max_amount}
                          onChange={(e) => updateLoanLimit(tier, 'max_amount', parseInt(e.target.value) || 0)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Taux max (%)</Label>
                        <Input
                          type="number"
                          value={limits.max_interest}
                          onChange={(e) => updateLoanLimit(tier, 'max_interest', parseFloat(e.target.value) || 0)}
                          className="mt-1"
                          step="0.5"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rentals Tab */}
          <TabsContent value="rentals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Remises location par niveau</CardTitle>
                <CardDescription>
                  Configurez les pourcentages de remise sur les locations pour chaque niveau.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {Object.entries(config.rental_discounts).map(([tier, discount]) => (
                    <div key={tier} className="flex items-center justify-between p-4 border rounded-lg">
                      <span className={`font-medium ${getTierColor(tier)}`}>
                        {getTierLabel(tier)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={discount}
                          onChange={(e) => updateRentalDiscount(tier, parseInt(e.target.value) || 0)}
                          className="w-20 text-right"
                          min={0}
                          max={50}
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Driving Events Tab — Uffizio alert weights */}
          <TabsContent value="driving" className="space-y-4">
            <DrivingEventWeightsEditor />
          </TabsContent>

          {/* Accident Penalties Tab */}
          <TabsContent value="accidents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  Pénalités de sinistre par gravité
                </CardTitle>
                <CardDescription>
                  Points retirés au DAM Score lorsqu'un sinistre est jugé "responsable". Les valeurs sont
                  saisies en positif et appliquées en négatif au score (de 0 à 300 points).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(['minor', 'moderate', 'severe'] as const).map((sev) => {
                  const labels: Record<typeof sev, { title: string; desc: string; tone: string }> = {
                    minor: {
                      title: 'Mineur',
                      desc: 'Petit accrochage, dégâts matériels limités, pas de blessure.',
                      tone: 'text-primary',
                    },
                    moderate: {
                      title: 'Modéré',
                      desc: 'Dégâts importants ou blessures légères. Implication de tiers.',
                      tone: 'text-warning',
                    },
                    severe: {
                      title: 'Grave',
                      desc: 'Dommages majeurs, blessures sérieuses, ou intervention de la police.',
                      tone: 'text-destructive',
                    },
                  };
                  const meta = labels[sev];
                  const positiveValue = Math.abs(config.accident_penalties[sev]);
                  return (
                    <div key={sev} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className={`flex items-center gap-2 font-medium ${meta.tone}`}>
                          <ShieldAlert className="h-4 w-4" />
                          {meta.title}
                        </Label>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-sm">−</span>
                          <Input
                            type="number"
                            value={positiveValue}
                            onChange={(e) =>
                              updateAccidentPenalty(sev, Math.abs(parseInt(e.target.value) || 0))
                            }
                            className="w-24 text-right"
                            min={0}
                            max={300}
                          />
                          <span className="text-muted-foreground text-sm">pts</span>
                        </div>
                      </div>
                      <Slider
                        value={[positiveValue]}
                        onValueChange={([v]) => updateAccidentPenalty(sev, v)}
                        min={0}
                        max={300}
                        step={5}
                        className="cursor-pointer"
                      />
                      <p className="text-sm text-muted-foreground">{meta.desc}</p>
                    </div>
                  );
                })}

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Ces valeurs sont utilisées par défaut dans la fenêtre "Statuer" lors de la
                    détermination de responsabilité. L'administrateur peut toujours saisir une valeur
                    personnalisée pour un cas spécifique.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Confirm Save Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmer les modifications</DialogTitle>
              <DialogDescription>
                Ces changements affecteront le calcul de tous les scores de crédit. Êtes-vous sûr ?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Annuler
              </Button>
              <Button onClick={confirmSave}>
                Confirmer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Run Scoring Dialog */}
        <Dialog open={showRunScoringDialog} onOpenChange={setShowRunScoringDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Lancer le calcul des scores</DialogTitle>
              <DialogDescription>
                Cette action va recalculer les scores de tous les chauffeurs actifs. Le processus peut prendre quelques minutes.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRunScoringDialog(false)} disabled={isRunningScoring}>
                Annuler
              </Button>
              <Button onClick={handleRunScoring} disabled={isRunningScoring}>
                {isRunningScoring ? 'Calcul en cours...' : 'Lancer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
