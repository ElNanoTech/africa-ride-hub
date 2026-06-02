import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, AlertTriangle, CheckCircle2, XCircle, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const SCENARIOS = [
  {
    id: "scenario-1",
    title: "Scenario 1 : Demande de pret (Happy Path)",
    prereqs: "Conducteur connecte, KYC approuve, Score >= Niveau C",
    steps: [
      { action: "Naviguer vers /driver/loans", expected: "Page Prets affichee avec score actuel et niveau" },
      { action: "Verifier les options de pret", expected: "Les prets debloques correspondent au niveau du conducteur" },
      { action: 'Cliquer "Demander" sur un pret debloque', expected: "Dialog de demande s'ouvre avec montants min/max" },
      { action: "Saisir un montant valide dans la plage", expected: 'Bouton "Soumettre" active' },
      { action: 'Cliquer "Soumettre"', expected: 'Toast "Demande de pret soumise avec succes!"' },
      { action: 'Verifier la section "Mes prets"', expected: 'Nouveau pret visible avec statut "En attente"' },
      { action: "Verifier les notifications", expected: 'Notification "Demande de pret soumise" recue' },
    ],
  },
  {
    id: "scenario-2",
    title: "Scenario 2 : Validation des montants (Negative Path)",
    prereqs: "Conducteur connecte avec acces aux prets",
    steps: [
      { action: "Saisir montant < minimum", expected: 'Message d\'erreur "Le montant doit etre entre X et Y"' },
      { action: "Saisir montant > maximum", expected: "Message d'erreur affiche, bouton desactive" },
      { action: "Saisir montant = 0", expected: 'Bouton "Soumettre" desactive' },
      { action: "Laisser le champ vide", expected: 'Bouton "Soumettre" desactive' },
    ],
  },
  {
    id: "scenario-3",
    title: "Scenario 3 : Eligibilite par niveau",
    prereqs: "Conducteurs avec differents niveaux de score",
    steps: [
      { action: "Conducteur Niveau E", expected: "Tous les prets verrouilles" },
      { action: "Conducteur Niveau D", expected: "Tous les prets verrouilles" },
      { action: "Conducteur Niveau C", expected: "Pret TV debloque uniquement" },
      { action: "Conducteur Niveau B", expected: "Pret TV + Pret Moto debloques" },
      { action: "Conducteur Niveau A", expected: "Tous les prets debloques" },
      { action: "Cliquer sur pret verrouille", expected: '"Niveau X requis", non cliquable' },
    ],
  },
  {
    id: "scenario-4",
    title: "Scenario 4 : Approbation par l'admin (Happy Path)",
    prereqs: "Au moins 1 pret pending, Admin avec role super_admin/manager/agent_pret",
    steps: [
      { action: "Naviguer vers /admin/loans", expected: 'Onglet "En attente" actif' },
      { action: 'Verifier le compteur "En attente"', expected: "Badge rouge avec le nombre correct" },
      { action: '"..." puis "Approuver"', expected: "Dialog d'examen avec resume du risque" },
      { action: "Verifier le resume du risque", expected: "Score, niveau et infos conducteur affiches" },
      { action: "Saisir un montant approuve", expected: "Champ pre-rempli avec le montant demande" },
      { action: 'Cliquer "Approuver"', expected: 'Toast "Pret approuve", dialog ferme' },
      { action: 'Verifier l\'onglet "Approuves"', expected: 'Pret deplace avec statut "Approuve"' },
      { action: "Verifier cote conducteur", expected: 'Notification "Pret approuve!" recue' },
    ],
  },
  {
    id: "scenario-5",
    title: "Scenario 5 : Rejet par l'admin",
    prereqs: "Pret en attente, Admin connecte",
    steps: [
      { action: "Ouvrir le dialog d'examen d'un pret", expected: "Dialog affiche" },
      { action: "Saisir un motif de rejet", expected: "Champ textarea rempli" },
      { action: 'Cliquer "Rejeter" sans motif', expected: "Rien ne se passe (validation)" },
      { action: 'Saisir un motif puis cliquer "Rejeter"', expected: 'Toast "Pret rejete", dialog ferme' },
      { action: 'Verifier l\'onglet "Rejetes"', expected: 'Pret visible avec statut "Refuse"' },
      { action: "Verifier cote conducteur", expected: '"Demande de pret refusee" avec motif' },
    ],
  },
  {
    id: "scenario-6",
    title: "Scenario 6 : Controle d'acces RBAC",
    prereqs: "Admins avec differents roles",
    steps: [
      { action: "super_admin: Approuver/Rejeter", expected: "Autorise" },
      { action: "manager: Approuver/Rejeter", expected: "Autorise" },
      { action: "agent_pret: Approuver/Rejeter", expected: "Autorise" },
      { action: "agent_support: Approuver/Rejeter", expected: "Boutons masques" },
    ],
  },
  {
    id: "scenario-7",
    title: "Scenario 7 : KYC Gate",
    prereqs: "Conducteurs avec differents statuts KYC",
    steps: [
      { action: "KYC non soumis", expected: "Page prets bloquee, message d'instruction" },
      { action: "KYC en attente", expected: 'Page bloquee, "en cours de verification"' },
      { action: "KYC rejete", expected: "Page bloquee, possibilite de re-soumettre" },
      { action: "KYC approuve", expected: "Page prets accessible normalement" },
    ],
  },
  {
    id: "scenario-8",
    title: "Scenario 8 : Decaissement et Remboursement",
    prereqs: "Pret approuve, Admin connecte",
    steps: [
      { action: "Admin change statut a disbursed", expected: '"Pret debourse" envoye au conducteur' },
      { action: "Admin cree les paiements de remboursement", expected: "Entrees dans payments avec loan_id" },
      { action: "Conducteur voit les paiements", expected: "Liste dans la section paiements" },
      { action: "Conducteur paie via Wave", expected: 'Paiement passe de pending a paid' },
      { action: "Tous les paiements effectues", expected: 'Statut du pret passe a completed' },
    ],
  },
  {
    id: "scenario-9",
    title: "Scenario 9 : Temps reel (Realtime)",
    prereqs: "2 sessions ouvertes (admin + conducteur)",
    steps: [
      { action: "Admin approuve un pret", expected: "Statut mis a jour sans rafraichir cote conducteur" },
      { action: "Conducteur soumet une demande", expected: 'Compteur "En attente" s\'incremente cote admin' },
    ],
  },
  {
    id: "scenario-10",
    title: "Scenario 10 : Conducteur sans profil",
    prereqs: "Utilisateur connecte sans profil conducteur",
    steps: [
      { action: "Acceder a la page prets", expected: '"Profil conducteur requis" affiche' },
      { action: "Verifier les options de pret", expected: "Pas de cards de pret affichees" },
    ],
  },
];

const ISSUES = [
  { id: 1, problem: "Pas de generation auto des paiements de remboursement", severity: "high", recommendation: "Creer un trigger generate_loan_payments" },
  { id: 2, problem: "Taux d'interet code en dur a 10%", severity: "medium", recommendation: "Rendre configurable via scoring_config" },
  { id: 3, problem: "Pas de verification de pret actif existant", severity: "medium", recommendation: "Empecher 2 prets actifs simultanes" },
  { id: 4, problem: "Pas de limite de duree de remboursement", severity: "medium", recommendation: "Ajouter repayment_duration_weeks" },
  { id: 5, problem: "Transition manuelle approved -> disbursed", severity: "medium", recommendation: "Automatiser ou ajouter un bouton dedie" },
  { id: 6, problem: "Pas d'historique de remboursement cote conducteur", severity: "medium", recommendation: "Ajouter une vue des paiements lies au pret" },
  { id: 7, problem: "Montant approuve peut etre > demande", severity: "low", recommendation: "Ajouter validation cote admin" },
];

const LOAN_TYPES = [
  { type: "Pret Voiture (car_loan)", min: "500 000 FCFA", max: "5 000 000 FCFA", level: "A" },
  { type: "Pret Moto (bike_loan)", min: "100 000 FCFA", max: "1 000 000 FCFA", level: "B" },
  { type: "Pret TV (tv_loan)", min: "50 000 FCFA", max: "300 000 FCFA", level: "C" },
];

const COVERAGE = [
  { aspect: "Demande de pret (conducteur)", covered: true, notes: "Validation montants + eligibilite niveau" },
  { aspect: "Approbation (admin)", covered: true, notes: "Avec montant et taux d'interet" },
  { aspect: "Rejet (admin)", covered: true, notes: "Avec motif obligatoire" },
  { aspect: "Notifications", covered: true, notes: "Triggers DB pour chaque changement de statut" },
  { aspect: "RBAC", covered: true, notes: "canApproveLoan() + RLS policies" },
  { aspect: "KYC Gate", covered: true, notes: "Composant KycGate" },
  { aspect: "Realtime", covered: true, notes: "useLoansRealtime()" },
  { aspect: "Decaissement auto", covered: false, notes: "Manuel uniquement" },
  { aspect: "Remboursement auto", covered: false, notes: "Pas de calendrier genere" },
  { aspect: "Pret en double", covered: false, notes: "Pas de verification" },
];

export default function TestLoans() {
  const navigate = useNavigate();
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});

  const toggleStep = (key: string) => {
    setCheckedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const totalSteps = SCENARIOS.reduce((acc, s) => acc + s.steps.length, 0);
  const checkedCount = Object.values(checkedSteps).filter(Boolean).length;
  const progress = totalSteps > 0 ? Math.round((checkedCount / totalSteps) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Tests Module Prets</h1>
            <p className="text-xs text-muted-foreground">
              {checkedCount}/{totalSteps} etapes ({progress}%)
            </p>
          </div>
          <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="container max-w-4xl py-6 px-4 space-y-6">
        {/* Business Flow */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Processus Metier</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {["Demande", "Examen", "Approuve/Refuse", "Decaissement", "Paiements", "Remboursement Wave", "Complete"].map((step, i) => (
                <span key={i} className="flex items-center gap-2">
                  <Badge variant="secondary" className="whitespace-nowrap">{step}</Badge>
                  {i < 6 && <span className="text-muted-foreground">→</span>}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Loan Types Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Types de prets et montants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Type</th>
                    <th className="text-left py-2 pr-4 font-medium">Min</th>
                    <th className="text-left py-2 pr-4 font-medium">Max</th>
                    <th className="text-left py-2 font-medium">Niveau</th>
                  </tr>
                </thead>
                <tbody>
                  {LOAN_TYPES.map((lt) => (
                    <tr key={lt.type} className="border-b last:border-0">
                      <td className="py-2 pr-4">{lt.type}</td>
                      <td className="py-2 pr-4">{lt.min}</td>
                      <td className="py-2 pr-4">{lt.max}</td>
                      <td className="py-2">
                        <Badge variant="outline">{lt.level}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="scenarios">
          <TabsList className="w-full">
            <TabsTrigger value="scenarios" className="flex-1">Scenarios ({SCENARIOS.length})</TabsTrigger>
            <TabsTrigger value="issues" className="flex-1">Problemes ({ISSUES.length})</TabsTrigger>
            <TabsTrigger value="coverage" className="flex-1">Couverture</TabsTrigger>
          </TabsList>

          <TabsContent value="scenarios" className="space-y-4 mt-4">
            <ScrollArea className="h-auto">
              {SCENARIOS.map((scenario) => (
                <Card key={scenario.id} className="mb-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{scenario.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">{scenario.prereqs}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {scenario.steps.map((step, idx) => {
                      const key = `${scenario.id}-${idx}`;
                      return (
                        <div
                          key={key}
                          className={`flex items-start gap-3 p-2 rounded-md text-sm transition-colors ${
                            checkedSteps[key] ? "bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox
                            checked={!!checkedSteps[key]}
                            onCheckedChange={() => toggleStep(key)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium ${checkedSteps[key] ? "line-through text-muted-foreground" : ""}`}>
                              {idx + 1}. {step.action}
                            </p>
                            <p className="text-muted-foreground text-xs mt-0.5">{step.expected}</p>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="issues" className="space-y-3 mt-4">
            {ISSUES.map((issue) => (
              <Card key={issue.id} className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                      issue.severity === "high"
                        ? "text-destructive"
                        : issue.severity === "medium"
                        ? "text-accent-foreground"
                        : "text-muted-foreground"
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium">{issue.problem}</p>
                      <Badge
                        variant={issue.severity === "high" ? "destructive" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {issue.severity === "high" ? "HAUTE" : issue.severity === "medium" ? "MOYENNE" : "BASSE"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{issue.recommendation}</p>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="coverage" className="mt-4">
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  {COVERAGE.map((item) => (
                    <div key={item.aspect} className="flex items-center gap-3 py-1.5 text-sm border-b last:border-0">
                      {item.covered ? (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      )}
                      <span className="font-medium flex-1">{item.aspect}</span>
                      <span className="text-xs text-muted-foreground">{item.notes}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Info */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 pt-4">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Ce guide de test couvre le module Prets de DAM Africa Connect. 
              Cochez les etapes au fur et a mesure pour suivre votre progression.
              Le fichier source est disponible dans <code className="text-[10px] bg-muted px-1 py-0.5 rounded">docs/TEST_SCENARIO_LOANS.md</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
