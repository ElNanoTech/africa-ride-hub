import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Driver360HeaderCard } from '@/components/admin/Driver360HeaderCard';
import {
  DriverInvoicesPanel,
  DriverAccidentsPanel,
  DriverActivityPanel,
} from '@/components/admin/driver360/panels';

interface Driver360ReportProps {
  driverId: string;
}

/**
 * Reusable "Rapport Chauffeur 360" block: KPI header + Vue d'ensemble / Historique /
 * Factures / Incidents sub-tabs. Used both on Driver Detail and Analytics pages.
 */
export function Driver360Report({ driverId }: Driver360ReportProps) {
  return (
    <div className="space-y-4">
      <Driver360HeaderCard driverId={driverId} />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Les indicateurs clés du conducteur (factures, paiements, score, KYC,
              sinistres et tickets) sont résumés dans les cartes ci-dessus.
              Utilisez les onglets pour explorer le détail de chaque domaine.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <DriverActivityPanel driverId={driverId} />
        </TabsContent>

        <TabsContent value="invoices">
          <DriverInvoicesPanel driverId={driverId} />
        </TabsContent>

        <TabsContent value="incidents">
          <DriverAccidentsPanel driverId={driverId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
