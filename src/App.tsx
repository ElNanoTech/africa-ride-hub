import { Suspense, useEffect } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { InstallPrompt, OfflineBanner } from "@/components/InstallPrompt";
import { PaymentQueueBanner } from "@/components/PaymentQueueBanner";
import { NotificationListener } from "@/components/NotificationListener";
import { RealtimeConnectionBanner } from "@/components/RealtimeConnectionBanner";
import { DemoModeProvider } from "./hooks/useDemoMode";
import { BrandingProvider } from "./hooks/useBranding";
import { GlobalConfetti } from "./components/GlobalConfetti";
import { LoadingState } from "./components/LoadingState";
import { ChunkErrorBoundary } from "./components/ChunkErrorBoundary";
import { ChunkUpdateBanner } from "./components/ChunkUpdateBanner";
import { preloadCommonRoutes } from "./lib/preloadRoutes";
import { AdminRouteGuard, AdminLoginRedirect } from "./components/AdminRouteGuard";
import { DriverRouteGuard, DriverLoginRedirect } from "./components/DriverRouteGuard";
import { EntitlementGate } from "./components/admin/EntitlementGate";
import { isDriverAppRoute } from "./lib/routeScopes";

// Aggressive caching for low-bandwidth African markets
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 1,
      networkMode: 'offlineFirst',
    },
  },
});

// Lazy-loaded pages
const Landing = lazy(() => import("./pages/Landing"));
const TestGuide = lazy(() => import("./pages/TestGuide"));
const TestLoans = lazy(() => import("./pages/TestLoans"));
const CustomerJourney = lazy(() => import("./pages/CustomerJourney"));
const Support = lazy(() => import("./pages/Support"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Install = lazy(() => import("./pages/Install"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Driver pages
const DriverLogin = lazy(() => import("./pages/driver/Login"));
const DriverHome = lazy(() => import("./pages/driver/Home"));
const DriverVehicles = lazy(() => import("./pages/driver/Vehicles"));
const DriverScore = lazy(() => import("./pages/driver/Score"));
const DriverLoans = lazy(() => import("./pages/driver/Loans"));
const DriverCredit = lazy(() => import("./pages/driver/Credit"));
const DriverJourney = lazy(() => import("./pages/driver/Journey"));
const DriverRental = lazy(() => import("./pages/driver/Rental"));
const DriverProfile = lazy(() => import("./pages/driver/Profile"));
const DriverKYC = lazy(() => import("./pages/driver/KYC"));
const DriverNotifications = lazy(() => import("./pages/driver/Notifications"));
const DriverNotificationSettings = lazy(() => import("./pages/driver/NotificationSettings"));
const DriverSupport = lazy(() => import("./pages/driver/Support"));
const DriverOnboarding = lazy(() => import("./pages/driver/Onboarding"));
const DriverProfileRequired = lazy(() => import("./pages/driver/ProfileRequired"));
const DriverIncomeReport = lazy(() => import("./pages/driver/IncomeReport"));
const DriverFinance = lazy(() => import("./pages/driver/Finance"));
const DriverLeaderboard = lazy(() => import("./pages/driver/Leaderboard"));
const DriverSettings = lazy(() => import("./pages/driver/Settings"));
const DriverActivityTimeline = lazy(() => import("./pages/driver/ActivityTimeline"));

// Admin pages
const AdminLogin = lazy(() => import("./pages/admin/Login"));
const AdminSetup = lazy(() => import("./pages/admin/Setup"));
const AdminForgotPassword = lazy(() => import("./pages/admin/ForgotPassword"));
const AdminResetPassword = lazy(() => import("./pages/admin/ResetPassword"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminDrivers = lazy(() => import("./pages/admin/Drivers"));
const AdminDriverDetail = lazy(() => import("./pages/admin/DriverDetail"));
const AdminDriverCreate = lazy(() => import("./pages/admin/DriverCreate"));
const AdminVehicleOperations = lazy(() => import("./pages/admin/VehicleOperations"));
const AdminVehicles = lazy(() => import("./pages/admin/Vehicles"));
const AdminVehicleDetail = lazy(() => import("./pages/admin/VehicleDetail"));
const AdminGpsMapping = lazy(() => import("./pages/admin/GpsMapping"));
const AdminRentals = lazy(() => import("./pages/admin/Rentals"));
const AdminLoans = lazy(() => import("./pages/admin/Loans"));
const AdminCreditOperations = lazy(() => import("./pages/admin/CreditOperations"));
const AdminUnderwritingOperations = lazy(() => import("./pages/admin/UnderwritingOperations"));
const AdminGrowthOwnership = lazy(() => import("./pages/admin/GrowthOwnership"));
const AdminRepaymentOperations = lazy(() => import("./pages/admin/RepaymentOperations"));
const AdminCreditCollections = lazy(() => import("./pages/admin/CreditCollections"));
const AdminCreditDefaultRecovery = lazy(() => import("./pages/admin/CreditDefaultRecovery"));
const AdminOwnershipCompletion = lazy(() => import("./pages/admin/OwnershipCompletion"));
const AdminCreditPortfolioAnalytics = lazy(() => import("./pages/admin/CreditPortfolioAnalytics"));
const AdminPayments = lazy(() => import("./pages/admin/Payments"));
const AdminSupport = lazy(() => import("./pages/admin/Support"));
const AdminScoringConfig = lazy(() => import("./pages/admin/ScoringConfig"));
const AdminAudit = lazy(() => import("./pages/admin/Audit"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminAnalytics = lazy(() => import("./pages/admin/Analytics"));
const AdminTracking = lazy(() => import("./pages/admin/Tracking"));
const AdminPlatformSync = lazy(() => import("./pages/admin/PlatformSync"));
const AdminFeatureFlags = lazy(() => import("./pages/admin/FeatureFlags"));
const AdminPlatformAdministration = lazy(() => import("./pages/admin/PlatformAdministration"));
const AdminOperatingExperience = lazy(() => import("./pages/admin/OperatingExperience"));
const AdminCustomerManagement = lazy(() => import("./pages/admin/CustomerManagement"));
const AdminManualIncomeEntry = lazy(() => import("./pages/admin/ManualIncomeEntry"));
const AdminIncomeApprovals = lazy(() => import("./pages/admin/IncomeApprovals"));
const AdminPricing = lazy(() => import("./pages/admin/Pricing"));
const AdminAIUsage = lazy(() => import("./pages/admin/AIUsageAnalytics"));
const AdminContracts = lazy(() => import("./pages/admin/Contracts"));
const DriverOwnership = lazy(() => import("./pages/driver/Ownership"));
const DriverVehicleInspection = lazy(() => import("./pages/driver/VehicleInspection"));
const DriverFleetControlHistory = lazy(() => import("./pages/driver/FleetControlHistory"));
const DriverFleetControlDetail = lazy(() => import("./pages/driver/FleetControlDetail"));
const DriverSinistresHome = lazy(() => import("./pages/driver/sinistres/SinistresHome"));
const DriverSinistreType = lazy(() => import("./pages/driver/sinistres/StepType"));
const DriverSinistreSafety = lazy(() => import("./pages/driver/sinistres/StepSafety"));
const DriverSinistreEvidence = lazy(() => import("./pages/driver/sinistres/StepEvidence"));
const DriverSinistreLocation = lazy(() => import("./pages/driver/sinistres/StepLocation"));
const DriverSinistreCaseDetail = lazy(() => import("./pages/driver/sinistres/CaseDetail"));
const DriverSinistreSuccess = lazy(() => import("./pages/driver/sinistres/SubmissionSuccess"));
const AdminDrivingBehavior = lazy(() => import("./pages/admin/DrivingBehavior"));
const AdminTrustRisk = lazy(() => import("./pages/admin/TrustRisk"));
const AdminSinistres = lazy(() => import("./pages/admin/Sinistres"));
const AdminSinistreDetail = lazy(() => import("./pages/admin/SinistreDetail"));
const AdminSinistresAnalytics = lazy(() => import("./pages/admin/SinistresAnalytics"));
const AdminFleetControl = lazy(() => import("./pages/admin/FleetControl"));
const AdminMaintenance = lazy(() => import("./pages/admin/Maintenance"));
const AdminContraventions = lazy(() => import("./pages/admin/Contraventions"));
const AdminAlertes = lazy(() => import("./pages/admin/Alertes"));
const AdminCommunication = lazy(() => import("./pages/admin/Communication"));
const AdminKira = lazy(() => import("./pages/admin/Kira"));
const DriverFormation = lazy(() => import("./pages/driver/Formation"));
const DriverAlertes = lazy(() => import("./pages/driver/Alertes"));
const DriverContraventions = lazy(() => import("./pages/driver/Contraventions"));
const AdminBilling = lazy(() => import("./pages/admin/Billing"));
const AdminBillingAudit = lazy(() => import("./pages/admin/BillingAudit"));
const AdminFinancialOperations = lazy(() => import("./pages/admin/FinancialOperations"));
const DriverFactures = lazy(() => import("./pages/driver/Factures"));
const DriverFactureDetail = lazy(() => import("./pages/driver/FactureDetail"));
const DriverWallet = lazy(() => import("./pages/driver/Wallet"));
const AdminWallets = lazy(() => import("./pages/admin/Wallets"));
const PublicInvoice = lazy(() => import("./pages/PublicInvoice"));

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <LoadingState message="Chargement..." />
  </div>
);

const DriverGlobalEffects = () => {
  const location = useLocation();
  if (!isDriverAppRoute(location.pathname)) return null;

  return (
    <>
      <PaymentQueueBanner />
      <NotificationListener />
      <RealtimeConnectionBanner />
    </>
  );
};

const App = () => {
  useEffect(() => {
    preloadCommonRoutes();
  }, []);

  return (
  <ThemeProvider attribute="class" defaultTheme="light" storageKey="dam-admin-theme">
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <DemoModeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <GlobalConfetti />
            <OfflineBanner />
            <ChunkUpdateBanner />
            <BrowserRouter>
              <InstallPrompt />
              <DriverGlobalEffects />
              <ChunkErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                  {/* Marketing / Public Routes */}
                  <Route path="/" element={<Landing />} />
                  <Route path="/test-guide" element={<TestGuide />} />
                  <Route path="/test-loans" element={<TestLoans />} />
                  <Route path="/customer-journey" element={<CustomerJourney />} />
                  <Route path="/support" element={<Support />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/install" element={<Install />} />
                  <Route path="/factures/public/:token" element={<PublicInvoice />} />
                  
                  {/* Driver Login — redirect to dashboard if already logged in (B30) */}
                  <Route path="/login" element={<DriverLoginRedirect><DriverLogin /></DriverLoginRedirect>} />
                  <Route path="/driver/login" element={<DriverLoginRedirect><DriverLogin /></DriverLoginRedirect>} />
                  
                  {/* Protected Driver Routes (B30) */}
                  <Route element={<DriverRouteGuard />}>
                    <Route path="/driver-dashboard" element={<DriverHome />} />
                    <Route path="/driver" element={<DriverHome />} />
	                    <Route path="/vehicles" element={<DriverVehicles />} />
	                    <Route path="/driver/vehicles" element={<DriverVehicles />} />
	                    <Route path="/driver/vehicle" element={<DriverVehicles />} />
                    <Route path="/rentals" element={<DriverRental />} />
                    <Route path="/driver/rental" element={<DriverRental />} />
                    <Route path="/score" element={<DriverScore />} />
                    <Route path="/driver/score" element={<DriverScore />} />
                    <Route path="/loans" element={<DriverLoans />} />
                    <Route path="/driver/loans" element={<DriverLoans />} />
                    <Route path="/driver/credit" element={<DriverCredit />} />
                    <Route path="/journey" element={<DriverJourney />} />
                    <Route path="/journey/eligibility" element={<DriverJourney />} />
                    <Route path="/journey/opportunities" element={<DriverJourney />} />
                    <Route path="/journey/opportunities/:opportunityId" element={<DriverJourney />} />
                    <Route path="/journey/simulator" element={<DriverJourney />} />
                    <Route path="/journey/application" element={<DriverJourney />} />
                    <Route path="/journey/milestones" element={<DriverJourney />} />
                    <Route path="/profile" element={<DriverProfile />} />
	                    <Route path="/driver/profile" element={<DriverProfile />} />
	                    <Route path="/driver/kyc" element={<DriverKYC />} />
	                    <Route path="/driver/profile/kyc" element={<DriverKYC />} />
                    <Route path="/notifications" element={<DriverNotifications />} />
                    <Route path="/driver/notifications" element={<DriverNotifications />} />
                    <Route path="/driver/notifications/settings" element={<DriverNotificationSettings />} />
                    <Route path="/driver/support" element={<DriverSupport />} />
                    <Route path="/driver/finance" element={<DriverFinance />} />
                    <Route path="/driver/income" element={<DriverIncomeReport />} />
                    <Route path="/driver/onboarding" element={<DriverOnboarding />} />
                    <Route path="/driver-onboarding" element={<DriverOnboarding />} />
                    <Route path="/driver/profile-required" element={<DriverProfileRequired />} />
                    <Route path="/driver/leaderboard" element={<DriverLeaderboard />} />
                    <Route path="/driver/settings" element={<DriverSettings />} />
                    <Route path="/driver/historique" element={<DriverActivityTimeline />} />
                    <Route path="/driver/factures" element={<DriverFactures />} />
                    <Route path="/driver/factures/:id" element={<DriverFactureDetail />} />
                    <Route path="/driver/portefeuille" element={<DriverWallet />} />
                    <Route path="/driver/wallet" element={<DriverWallet />} />
                    <Route path="/driver/ownership" element={<DriverOwnership />} />
                    <Route path="/driver/sinistres" element={<DriverSinistresHome />} />
                    <Route path="/driver/sinistres/report/:id/type" element={<DriverSinistreType />} />
                    <Route path="/driver/sinistres/report/:id/safety" element={<DriverSinistreSafety />} />
                    <Route path="/driver/sinistres/report/:id/evidence" element={<DriverSinistreEvidence />} />
                    <Route path="/driver/sinistres/report/:id/location" element={<DriverSinistreLocation />} />
                    <Route path="/driver/sinistres/cases/:id" element={<DriverSinistreCaseDetail />} />
                    <Route path="/driver/sinistres/success/:id" element={<DriverSinistreSuccess />} />
                    <Route path="/driver/inspection" element={<DriverVehicleInspection />} />
                    <Route path="/driver/fleet-control" element={<DriverVehicleInspection />} />
                    <Route path="/driver/fleet-control/history" element={<DriverFleetControlHistory />} />
                    <Route path="/driver/fleet-control/:id" element={<DriverFleetControlDetail />} />
	                    <Route path="/driver/formation" element={<DriverFormation />} />
	                    <Route path="/driver/alertes" element={<DriverAlertes />} />
	                    <Route path="/driver/alerts" element={<DriverAlertes />} />
	                    <Route path="/driver/contraventions" element={<DriverContraventions />} />
                  </Route>
                  
                  {/* Admin Login — redirect to dashboard if already logged in (B2) */}
                  <Route path="/admin/login" element={<AdminLoginRedirect><AdminLogin /></AdminLoginRedirect>} />
                  <Route path="/admin/setup" element={<AdminSetup />} />
                  <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />
                  <Route path="/admin/reset-password" element={<AdminResetPassword />} />
                  
                  {/* Protected Admin Routes (B2) */}
                  <Route element={<AdminRouteGuard />}>
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/admin/attention" element={<AdminDashboard />} />
                    <Route path="/admin/dashboard" element={<AdminDashboard />} />
                    <Route path="/admin/drivers" element={<AdminDrivers />} />
                    <Route path="/admin/drivers/new" element={<AdminDriverCreate />} />
                    <Route path="/admin/drivers/:id" element={<AdminDriverDetail />} />
                    <Route path="/admin/vehicle-operations" element={<AdminVehicleOperations />} />
                    <Route path="/admin/vehicles" element={<AdminVehicles />} />
                    <Route path="/admin/vehicles/gps-mapping" element={<AdminGpsMapping />} />
                    <Route path="/admin/vehicles/:id" element={<AdminVehicleDetail />} />
                    <Route path="/admin/gps-mapping" element={<AdminGpsMapping />} />
                    <Route path="/admin/rentals" element={<AdminRentals />} />
                    <Route path="/admin/growth" element={<EntitlementGate featureKey="growth_center" moduleName="KIRA Growth"><AdminGrowthOwnership /></EntitlementGate>} />
                    <Route path="/admin/growth/pipeline" element={<EntitlementGate featureKey="growth_center" moduleName="KIRA Growth"><AdminGrowthOwnership /></EntitlementGate>} />
                    <Route path="/admin/growth/reviews" element={<EntitlementGate featureKey="growth_center" moduleName="KIRA Growth"><AdminGrowthOwnership /></EntitlementGate>} />
                    <Route path="/admin/growth/offers" element={<EntitlementGate featureKey="growth_center" moduleName="KIRA Growth"><AdminGrowthOwnership /></EntitlementGate>} />
                    <Route path="/admin/growth/ownership" element={<EntitlementGate featureKey="growth_center" moduleName="KIRA Growth"><AdminGrowthOwnership /></EntitlementGate>} />
                    <Route path="/admin/growth/analytics" element={<EntitlementGate featureKey="growth_center" moduleName="KIRA Growth"><AdminGrowthOwnership /></EntitlementGate>} />
                    <Route path="/admin/growth-ownership" element={<EntitlementGate featureKey="growth_center" moduleName="KIRA Growth"><AdminGrowthOwnership /></EntitlementGate>} />
                    <Route path="/admin/loans" element={<EntitlementGate featureKey="credit_products" moduleName="KIRA Credit"><AdminLoans /></EntitlementGate>} />
                    <Route path="/admin/credit-operations" element={<EntitlementGate featureKey="credit_products" moduleName="KIRA Credit"><AdminCreditOperations /></EntitlementGate>} />
                    <Route path="/admin/credit" element={<EntitlementGate featureKey="credit_products" moduleName="KIRA Credit"><AdminCreditOperations /></EntitlementGate>} />
                    <Route path="/admin/underwriting-operations" element={<EntitlementGate featureKey="underwriting" moduleName="KIRA Underwriting"><AdminUnderwritingOperations /></EntitlementGate>} />
                    <Route path="/admin/underwriting" element={<EntitlementGate featureKey="underwriting" moduleName="KIRA Underwriting"><AdminUnderwritingOperations /></EntitlementGate>} />
                    <Route path="/admin/repayment-operations" element={<EntitlementGate featureKey="repayment" moduleName="KIRA Repayment"><AdminRepaymentOperations /></EntitlementGate>} />
                    <Route path="/admin/repayment" element={<EntitlementGate featureKey="repayment" moduleName="KIRA Repayment"><AdminRepaymentOperations /></EntitlementGate>} />
                    <Route path="/admin/credit-collections" element={<EntitlementGate featureKey="collections" moduleName="KIRA Collections"><AdminCreditCollections /></EntitlementGate>} />
                    <Route path="/admin/collections" element={<EntitlementGate featureKey="collections" moduleName="KIRA Collections"><AdminCreditCollections /></EntitlementGate>} />
                    <Route path="/admin/default-recovery" element={<EntitlementGate featureKey="recovery" moduleName="KIRA Recovery"><AdminCreditDefaultRecovery /></EntitlementGate>} />
                    <Route path="/admin/default-reviews" element={<EntitlementGate featureKey="recovery" moduleName="KIRA Recovery"><AdminCreditDefaultRecovery /></EntitlementGate>} />
                    <Route path="/admin/defaults" element={<EntitlementGate featureKey="recovery" moduleName="KIRA Recovery"><AdminCreditDefaultRecovery /></EntitlementGate>} />
                    <Route path="/admin/ownership-completion" element={<EntitlementGate featureKey="ownership_completion" moduleName="KIRA Ownership"><AdminOwnershipCompletion /></EntitlementGate>} />
                    <Route path="/admin/asset-transfers" element={<EntitlementGate featureKey="asset_transfer" moduleName="KIRA Ownership"><AdminOwnershipCompletion /></EntitlementGate>} />
                    <Route path="/admin/ownership-certificates" element={<EntitlementGate featureKey="certificates" moduleName="KIRA Ownership"><AdminOwnershipCompletion /></EntitlementGate>} />
                    <Route path="/admin/credit-portfolio" element={<EntitlementGate featureKey="portfolio_analytics" moduleName="KIRA Intelligence"><AdminCreditPortfolioAnalytics /></EntitlementGate>} />
                    <Route path="/admin/portfolio-analytics" element={<EntitlementGate featureKey="portfolio_analytics" moduleName="KIRA Intelligence"><AdminCreditPortfolioAnalytics /></EntitlementGate>} />
                    <Route path="/admin/executive-intelligence" element={<EntitlementGate featureKey="executive_dashboards" moduleName="KIRA Intelligence"><AdminCreditPortfolioAnalytics /></EntitlementGate>} />
                    <Route path="/admin/portfolio-health" element={<EntitlementGate featureKey="portfolio_analytics" moduleName="KIRA Intelligence"><AdminCreditPortfolioAnalytics /></EntitlementGate>} />
                    <Route path="/admin/credit-analytics" element={<EntitlementGate featureKey="portfolio_analytics" moduleName="KIRA Intelligence"><AdminCreditPortfolioAnalytics /></EntitlementGate>} />
                    <Route path="/admin/payments" element={<AdminPayments />} />
                    <Route path="/admin/finance" element={<AdminFinancialOperations />} />
                    <Route path="/admin/financial-operations" element={<AdminFinancialOperations />} />
                    <Route path="/admin/billing" element={<AdminBilling />} />
                    <Route path="/admin/billing/settings" element={<AdminBilling />} />
                    <Route path="/admin/billing/unresolved" element={<AdminBilling />} />
                    <Route path="/admin/billing/audit" element={<AdminBillingAudit />} />
                    <Route path="/admin/billing/wallets" element={<AdminWallets />} />
                    <Route path="/admin/support" element={<AdminSupport />} />
                    <Route path="/admin/scoring" element={<EntitlementGate featureKey="advanced_driver_scoring" moduleName="KIRA Trust"><AdminScoringConfig /></EntitlementGate>} />
                    <Route path="/admin/audit" element={<AdminAudit />} />
                    <Route path="/admin/users" element={<AdminUsers />} />
                    <Route path="/admin/settings" element={<AdminSettings />} />
                    <Route path="/admin/analytics" element={<AdminAnalytics />} />
                    <Route path="/admin/tracking" element={<AdminTracking />} />
                    <Route path="/admin/platform-sync" element={<AdminPlatformSync />} />
                    <Route path="/admin/feature-flags" element={<AdminFeatureFlags />} />
                    <Route path="/admin/platform-administration" element={<AdminPlatformAdministration />} />
                    <Route path="/admin/platform-licensing" element={<AdminPlatformAdministration />} />
                    <Route path="/admin/licensing" element={<AdminPlatformAdministration />} />
                    <Route path="/admin/entitlements" element={<AdminPlatformAdministration />} />
                    <Route path="/admin/operating-experience" element={<AdminOperatingExperience />} />
                    <Route path="/admin/learning-center" element={<AdminOperatingExperience />} />
                    <Route path="/admin/knowledge" element={<AdminOperatingExperience />} />
                    <Route path="/admin/playbooks" element={<AdminOperatingExperience />} />
                    <Route path="/admin/tenant-health" element={<AdminOperatingExperience />} />
                    <Route path="/admin/customers" element={<AdminCustomerManagement />} />
                    <Route path="/admin/income-entry" element={<AdminManualIncomeEntry />} />
                    <Route path="/admin/income-approvals" element={<AdminIncomeApprovals />} />
                    <Route path="/admin/pricing" element={<AdminPricing />} />
                    <Route path="/admin/ai-usage" element={<AdminAIUsage />} />
                    <Route path="/admin/contracts" element={<EntitlementGate featureKey="contracts" moduleName="KIRA Credit"><AdminContracts /></EntitlementGate>} />
                    <Route path="/admin/driving-behavior" element={<EntitlementGate featureKey="advanced_driver_scoring" moduleName="KIRA Trust"><AdminDrivingBehavior /></EntitlementGate>} />
                    <Route path="/admin/trust-risk" element={<EntitlementGate featureKey="trust_center" moduleName="KIRA Trust"><AdminTrustRisk /></EntitlementGate>} />
                    <Route path="/admin/sinistres" element={<AdminSinistres />} />
                    <Route path="/admin/incidents" element={<AdminSinistres />} />
                    <Route path="/admin/fleet-control" element={<AdminFleetControl />} />
                    <Route path="/admin/maintenance" element={<AdminMaintenance />} />
                    <Route path="/admin/contraventions" element={<AdminContraventions />} />
                    <Route path="/admin/alertes" element={<AdminAlertes />} />
                    <Route path="/admin/communication" element={<AdminCommunication />} />
                    <Route path="/admin/kira" element={<AdminKira />} />
                    <Route path="/admin/sinistres/analytics" element={<AdminSinistresAnalytics />} />
                    <Route path="/admin/sinistres/:id" element={<AdminSinistreDetail />} />
                  </Route>
                  
                  {/* Catch-all */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ChunkErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </DemoModeProvider>
    </BrandingProvider>
  </QueryClientProvider>
</ThemeProvider>
  );
};

export default App;
