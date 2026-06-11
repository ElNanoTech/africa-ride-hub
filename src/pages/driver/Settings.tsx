import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import {
  Shield, FileText, Mail, ChevronRight, ExternalLink, Info, Receipt, Wallet,
  Bell,
} from 'lucide-react';

const SUPPORT_EMAIL = 'support@damflotte.com';

export default function Settings() {
  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: 'Paramètres' }]} />
      <PageHeader title="Paramètres" />

      {/* Documents */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Mes documents
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            <Link
              to="/driver/factures"
              className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors min-h-[48px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="font-medium">Mes factures &amp; relevés</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              to="/driver/portefeuille"
              className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors min-h-[48px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <span className="font-medium">Mon portefeuille</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Activity */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Mon activité
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            <Link
              to="/driver/alertes"
              className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors min-h-[48px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-destructive" />
                </div>
                <span className="font-medium">Mes alertes</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Legal */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Légal
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            <Link
              to="/privacy"
              className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors min-h-[48px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="font-medium">Politique de confidentialité</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>

            <Link
              to="/terms"
              className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors min-h-[48px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="font-medium">Conditions d'utilisation</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Support */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Assistance
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            <Link
              to="/driver/support"
              className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors min-h-[48px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Info className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="font-medium">Centre d'aide</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>

            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors min-h-[48px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <span className="font-medium">Email de support</span>
                  <p className="text-xs text-muted-foreground">{SUPPORT_EMAIL}</p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </CardContent>
        </Card>
      </div>

      {/* App Info */}
      <div className="px-4 mb-6 text-center">
        <p className="text-xs text-muted-foreground">
          DAM Flotte v1.0.0 · Côte d'Ivoire 🇨🇮
        </p>
      </div>
    </DriverLayout>
  );
}
