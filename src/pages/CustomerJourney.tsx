import { useState, useRef } from "react";
import { Car, CreditCard, FileText, Home, MessageSquare, Shield, Smartphone, TrendingUp, User, Users, Wallet, MapPin, Bell, Settings, ClipboardList, BarChart3, Download, Loader2, Presentation, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatePresence } from "framer-motion";
import logo from "@/assets/dam-flotte-logo.png";
import jsPDF from "jspdf";
import DemoMode from "@/components/DemoMode";

// Screenshots
import landingScreenshot from "@/assets/screenshots/landing.png";
import driverLoginScreenshot from "@/assets/screenshots/driver-login.png";
import adminLoginScreenshot from "@/assets/screenshots/admin-login.png";
import driverHomeMockup from "@/assets/screenshots/driver-home-mockup.png";
import driverVehiclesMockup from "@/assets/screenshots/driver-vehicles-mockup.png";
import adminDashboardMockup from "@/assets/screenshots/admin-dashboard-mockup.png";
import driverScoreMockup from "@/assets/screenshots/driver-score-mockup.png";
import adminDriversMockup from "@/assets/screenshots/admin-drivers-mockup.png";
import adminPaymentsMockup from "@/assets/screenshots/admin-payments-mockup.png";
import adminLoansMockup from "@/assets/screenshots/admin-loans-mockup.png";

// Demo steps configuration
const demoSteps = [
  {
    id: "landing",
    title: "Welcome to Dam Flotte",
    description: "The landing page introduces drivers and fleet managers to the platform. Users can choose to login as a driver or access the admin portal.",
    image: landingScreenshot,
    route: "/",
  },
  {
    id: "driver-login",
    title: "Driver Login",
    description: "Drivers authenticate using their Yango ID. The mobile-first design ensures easy access from any smartphone.",
    image: driverLoginScreenshot,
    route: "/driver",
  },
  {
    id: "driver-home",
    title: "Driver Dashboard",
    description: "The home screen shows the credit score, daily tips for improvement, upcoming payments, and quick actions for common tasks.",
    image: driverHomeMockup,
    route: "/driver/home",
  },
  {
    id: "driver-vehicles",
    title: "Vehicle Catalog",
    description: "Browse available vehicles with detailed pricing, specifications, and availability status. Apply for rentals with one tap.",
    image: driverVehiclesMockup,
    route: "/driver/vehicles",
  },
  {
    id: "driver-score",
    title: "Credit Score Details",
    description: "Detailed breakdown of the credit score by factors: payment history, driving behavior, and income stability. AI-generated tips help drivers improve.",
    image: driverScoreMockup,
    route: "/driver/score",
  },
  {
    id: "admin-login",
    title: "Admin Portal Login",
    description: "Fleet managers and administrators access the back-office through a secure login with role-based permissions.",
    image: adminLoginScreenshot,
    route: "/admin",
  },
  {
    id: "admin-dashboard",
    title: "Admin Dashboard",
    description: "Comprehensive overview with KPIs, revenue charts, pending approvals, and fleet status at a glance.",
    image: adminDashboardMockup,
    route: "/admin/dashboard",
  },
  {
    id: "admin-drivers",
    title: "Driver Management",
    description: "View all drivers with their KYC status, active vehicles, and credit scores. Search, filter, and manage individual profiles.",
    image: adminDriversMockup,
    route: "/admin/drivers",
  },
  {
    id: "admin-payments",
    title: "Payment Tracking",
    description: "Monitor all payments with status filters. Track collection rates, overdue amounts, and mark payments as received.",
    image: adminPaymentsMockup,
    route: "/admin/payments",
  },
  {
    id: "admin-loans",
    title: "Loan Management",
    description: "Review and process loan applications. Approve or reject with custom terms based on driver credit scores.",
    image: adminLoansMockup,
    route: "/admin/loans",
  },
];

const CustomerJourney = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPPTX, setIsExportingPPTX] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const exportToPDF = async () => {
    if (!contentRef.current) return;
    
    setIsExporting(true);
    
    try {
      // Dynamic import to avoid build issues
      const html2canvas = (await import("html2canvas")).default;
      
      const content = contentRef.current;
      const sections = content.querySelectorAll('section');
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i] as HTMLElement;
        
        const canvas = await html2canvas(section, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = pageWidth - (margin * 2);
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (i > 0) {
          pdf.addPage();
        }
        
        // Center vertically if image is smaller than page
        const yPos = imgHeight < pageHeight - (margin * 2) 
          ? (pageHeight - imgHeight) / 2 
          : margin;
        
        pdf.addImage(imgData, 'JPEG', margin, yPos, imgWidth, imgHeight);
      }
      
      pdf.save('Dam-Flotte-Customer-Journey.pdf');
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPPTX = async () => {
    if (!contentRef.current) return;
    
    setIsExportingPPTX(true);
    
    try {
      const pptxgen = (await import("pptxgenjs")).default;
      const html2canvas = (await import("html2canvas")).default;
      
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';
      pres.title = 'Dam Flotte - Customer Journey';
      pres.author = 'Dam Flotte';
      pres.subject = 'Customer Journey & Application Overview';
      
      const content = contentRef.current;
      const sections = content.querySelectorAll('section');
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i] as HTMLElement;
        
        const canvas = await html2canvas(section, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
        
        const imgData = canvas.toDataURL('image/png');
        
        const slide = pres.addSlide();
        
        // Calculate dimensions to fit slide (10" x 5.625" for 16:9)
        const slideWidth = 10;
        const slideHeight = 5.625;
        const imgAspect = canvas.width / canvas.height;
        const slideAspect = slideWidth / slideHeight;
        
        let imgWidth, imgHeight, x, y;
        
        if (imgAspect > slideAspect) {
          // Image is wider - fit to width
          imgWidth = slideWidth;
          imgHeight = slideWidth / imgAspect;
          x = 0;
          y = (slideHeight - imgHeight) / 2;
        } else {
          // Image is taller - fit to height
          imgHeight = slideHeight;
          imgWidth = slideHeight * imgAspect;
          x = (slideWidth - imgWidth) / 2;
          y = 0;
        }
        
        slide.addImage({
          data: imgData,
          x: x,
          y: y,
          w: imgWidth,
          h: imgHeight,
        });
      }
      
      await pres.writeFile({ fileName: 'Dam-Flotte-Customer-Journey.pptx' });
    } catch (error) {
      console.error('Error exporting PPTX:', error);
    } finally {
      setIsExportingPPTX(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 print:text-black">
      {/* Demo Mode */}
      <AnimatePresence>
        {showDemo && (
          <DemoMode steps={demoSteps} onClose={() => setShowDemo(false)} />
        )}
      </AnimatePresence>

      {/* Action Buttons - Fixed */}
      <div className="fixed top-4 right-4 z-50 print:hidden flex gap-2">
        <Button 
          onClick={() => setShowDemo(true)}
          variant="default"
          className="shadow-lg bg-gradient-to-r from-primary to-primary/80"
        >
          <Play className="h-4 w-4 mr-2" />
          Start Demo
        </Button>
        <Button 
          onClick={exportToPPTX} 
          disabled={isExportingPPTX || isExporting}
          variant="outline"
          className="shadow-lg"
        >
          {isExportingPPTX ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Presentation className="h-4 w-4 mr-2" />
              Download PPTX
            </>
          )}
        </Button>
        <Button 
          onClick={exportToPDF} 
          disabled={isExporting || isExportingPPTX}
          variant="outline"
          className="shadow-lg"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </>
          )}
        </Button>
      </div>

      <div ref={contentRef}>
        {/* Cover Page */}
        <section className="min-h-screen flex flex-col items-center justify-center p-8 border-b-4 border-primary print:break-after-page">
          <img src={logo} alt="Dam Flotte" className="h-24 mb-8" />
          <h1 className="text-5xl font-bold text-center mb-4">Dam Flotte</h1>
          <p className="text-2xl text-muted-foreground text-center mb-8">
            Plateforme de Gestion de Flotte & Crédit Chauffeur
          </p>
          <div className="text-lg text-center text-muted-foreground">
            <p>Customer Journey & Application Overview</p>
            <p className="mt-2">January 2026</p>
          </div>
        </section>

      {/* Screenshots Gallery - Public Pages */}
      <section className="p-8 bg-gray-50 print:bg-white print:break-after-page">
        <h2 className="text-3xl font-bold mb-6 border-b-2 border-primary pb-2">Application Screenshots</h2>
        
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold mb-4">Landing Page</h3>
            <img src={landingScreenshot} alt="Landing Page" className="rounded-lg shadow-lg border w-full" />
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xl font-semibold mb-4">Driver Login</h3>
              <img src={driverLoginScreenshot} alt="Driver Login" className="rounded-lg shadow-lg border w-full" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Admin Login</h3>
              <img src={adminLoginScreenshot} alt="Admin Login" className="rounded-lg shadow-lg border w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Driver App Mockups */}
      <section className="p-8 print:break-after-page">
        <h2 className="text-3xl font-bold mb-6 border-b-2 border-primary pb-2">Driver App Screens</h2>
        
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold mb-4">Driver Dashboard</h3>
            <p className="text-muted-foreground mb-4">Credit score overview, daily tips, upcoming payments, and quick actions.</p>
            <img src={driverHomeMockup} alt="Driver Home" className="rounded-lg shadow-lg border w-full" />
          </div>
          
          <div>
            <h3 className="text-xl font-semibold mb-4">Vehicle Catalog</h3>
            <p className="text-muted-foreground mb-4">Browse available vehicles with pricing and availability status.</p>
            <img src={driverVehiclesMockup} alt="Vehicles" className="rounded-lg shadow-lg border w-full" />
          </div>
          
          <div>
            <h3 className="text-xl font-semibold mb-4">Credit Score Details</h3>
            <p className="text-muted-foreground mb-4">Detailed score breakdown by factors with AI-generated improvement tips.</p>
            <img src={driverScoreMockup} alt="Credit Score" className="rounded-lg shadow-lg border w-full" />
          </div>
        </div>
      </section>

      {/* Admin Dashboard Mockup */}
      <section className="p-8 bg-gray-50 print:bg-white print:break-after-page">
        <h2 className="text-3xl font-bold mb-6 border-b-2 border-primary pb-2">Admin Dashboard</h2>
        <p className="text-muted-foreground mb-6">Comprehensive management portal with KPIs, charts, and pending approvals.</p>
        <img src={adminDashboardMockup} alt="Admin Dashboard" className="rounded-lg shadow-lg border w-full" />
      </section>

      {/* Admin Modules */}
      <section className="p-8 print:break-after-page">
        <h2 className="text-3xl font-bold mb-6 border-b-2 border-primary pb-2">Admin Management Modules</h2>
        
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold mb-4">Drivers Management</h3>
            <p className="text-muted-foreground mb-4">View all drivers, KYC status, active vehicles, and credit scores. Search, filter, and manage driver profiles.</p>
            <img src={adminDriversMockup} alt="Drivers Management" className="rounded-lg shadow-lg border w-full" />
          </div>
          
          <div>
            <h3 className="text-xl font-semibold mb-4">Payments Tracking</h3>
            <p className="text-muted-foreground mb-4">Monitor all payments with status filters (Paid/Pending/Overdue). Track collection rates and outstanding amounts.</p>
            <img src={adminPaymentsMockup} alt="Payments Management" className="rounded-lg shadow-lg border w-full" />
          </div>
          
          <div>
            <h3 className="text-xl font-semibold mb-4">Loan Applications</h3>
            <p className="text-muted-foreground mb-4">Review loan applications, approve or reject with one click. View credit scores and disbursement metrics.</p>
            <img src={adminLoansMockup} alt="Loans Management" className="rounded-lg shadow-lg border w-full" />
          </div>
        </div>
      </section>

      {/* Overview */}
      <section className="p-8 print:break-after-page">
        <h2 className="text-3xl font-bold mb-6 border-b-2 border-primary pb-2">Application Overview</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                Driver Mobile App
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                A Progressive Web App (PWA) for drivers to manage their rentals, track credit scores, 
                apply for loans, and communicate with support.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Admin Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Comprehensive management portal for fleet operators to manage drivers, vehicles, 
                rentals, loans, payments, and monitor fleet performance.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Driver Journey */}
      <section className="p-8 bg-gray-50 print:bg-white print:break-after-page">
        <h2 className="text-3xl font-bold mb-6 border-b-2 border-primary pb-2">Driver Journey</h2>
        
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
              1
            </div>
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Onboarding & Login
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>Driver enters their Yango ID to access the platform. First-time users complete KYC verification.</p>
                <div className="mt-2 text-sm text-muted-foreground">
                  Route: <code>/driver</code>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
              2
            </div>
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  KYC Verification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>Driver submits identity documents, driver's license, and bank account details for verification.</p>
                <div className="mt-2 text-sm text-muted-foreground">
                  Route: <code>/driver/kyc</code>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
              3
            </div>
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="h-5 w-5" />
                  Dashboard Home
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>View credit score, daily tips, active rental status, upcoming payments, and quick actions.</p>
                <div className="mt-2 text-sm text-muted-foreground">
                  Route: <code>/driver/home</code>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
              4
            </div>
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Car className="h-5 w-5" />
                  Browse & Rent Vehicles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>Browse available vehicles, view details and pricing, and submit rental requests.</p>
                <div className="mt-2 text-sm text-muted-foreground">
                  Route: <code>/driver/vehicles</code>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Step 5 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
              5
            </div>
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Track Credit Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>Monitor credit score with breakdown by factors (payments, driving, income). Get AI-powered tips to improve.</p>
                <div className="mt-2 text-sm text-muted-foreground">
                  Route: <code>/driver/score</code>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Step 6 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
              6
            </div>
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Apply for Loans
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>Based on credit score tier, apply for instant loans or vehicle financing with personalized rates.</p>
                <div className="mt-2 text-sm text-muted-foreground">
                  Route: <code>/driver/loans</code>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Step 7 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
              7
            </div>
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Support & Communication
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>Create support tickets, chat with support agents, and receive notifications about rentals and payments.</p>
                <div className="mt-2 text-sm text-muted-foreground">
                  Route: <code>/driver/support</code>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Admin Modules */}
      <section className="p-8 print:break-after-page">
        <h2 className="text-3xl font-bold mb-6 border-b-2 border-primary pb-2">Admin Portal Modules</h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              KPIs, revenue charts, pending actions, and fleet overview at a glance.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-primary" />
                Drivers
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Manage driver profiles, KYC status, and view individual performance.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Car className="h-5 w-5 text-primary" />
                Vehicles
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Fleet inventory, availability status, and vehicle details management.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5 text-primary" />
                Rentals
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Approve/reject rental requests, manage active rentals, and end contracts.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5 text-primary" />
                Payments
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Track all payments, mark as paid, and monitor overdue accounts.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5 text-primary" />
                Loans
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Review loan applications, approve with custom terms, and track disbursements.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-primary" />
                Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Real-time GPS tracking, trip history replay, and geofence alerts.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                Analytics
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Revenue trends, driver performance, and fleet utilization reports.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5 text-primary" />
                Support
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Manage support tickets, assign agents, and respond to driver inquiries.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-primary" />
                Users & Roles
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Manage admin users with role-based access (super_admin, manager, loan_officer, support_agent).
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5 text-primary" />
                Scoring Config
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Configure credit scoring weights, thresholds, and tier definitions.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-5 w-5 text-primary" />
                Audit Log
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Complete audit trail of all admin actions for compliance and security.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* User Flow Diagram */}
      <section className="p-8 bg-gray-50 print:bg-white print:break-after-page">
        <h2 className="text-3xl font-bold mb-6 border-b-2 border-primary pb-2">System Architecture</h2>
        
        <div className="bg-white p-6 rounded-lg border">
          <div className="text-center mb-8">
            <h3 className="text-xl font-semibold mb-4">Data Flow</h3>
            <div className="flex flex-wrap justify-center items-center gap-4">
              <div className="bg-blue-100 p-4 rounded-lg text-center">
                <Smartphone className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                <p className="font-medium">Driver App</p>
              </div>
              <div className="text-2xl">→</div>
              <div className="bg-green-100 p-4 rounded-lg text-center">
                <Shield className="h-8 w-8 mx-auto mb-2 text-green-600" />
                <p className="font-medium">Lovable Cloud</p>
                <p className="text-xs text-muted-foreground">Database + Auth</p>
              </div>
              <div className="text-2xl">←</div>
              <div className="bg-purple-100 p-4 rounded-lg text-center">
                <Settings className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                <p className="font-medium">Admin Portal</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <div className="text-center">
              <h4 className="font-semibold mb-2">External Integrations</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Yango (Driver Data)</li>
                <li>• Uffizio (GPS Telemetry)</li>
                <li>• Wave (Payments)</li>
              </ul>
            </div>
            <div className="text-center">
              <h4 className="font-semibold mb-2">AI Features</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Credit Score Explanations</li>
                <li>• Personalized Tips</li>
                <li>• Risk Assessment</li>
              </ul>
            </div>
            <div className="text-center">
              <h4 className="font-semibold mb-2">Security</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Role-Based Access Control</li>
                <li>• Row Level Security</li>
                <li>• Audit Logging</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Credit Tiers */}
      <section className="p-8 print:break-after-page">
        <h2 className="text-3xl font-bold mb-6 border-b-2 border-primary pb-2">Credit Scoring Tiers</h2>

        <div className="grid md:grid-cols-4 gap-4">
          <Card className="border-2 border-yellow-500">
            <CardHeader className="bg-yellow-50">
              <CardTitle className="text-yellow-700">Niveau E — Démarrage</CardTitle>
              <p className="text-sm text-muted-foreground">Score: 300-499</p>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="text-sm space-y-1">
                <li>• Basic rental access</li>
                <li>• Standard rates</li>
                <li>• Limited loan eligibility</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-2 border-gray-400">
            <CardHeader className="bg-gray-50">
              <CardTitle className="text-gray-700">Niveau C — Intermédiaire</CardTitle>
              <p className="text-sm text-muted-foreground">Score: 500-649</p>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="text-sm space-y-1">
                <li>• Priority vehicle access</li>
                <li>• 5% rate discount</li>
                <li>• Small instant loans</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-2 border-amber-500">
            <CardHeader className="bg-amber-50">
              <CardTitle className="text-amber-700">Niveau B — Avancé</CardTitle>
              <p className="text-sm text-muted-foreground">Score: 650-799</p>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="text-sm space-y-1">
                <li>• Premium vehicles</li>
                <li>• 10% rate discount</li>
                <li>• Medium instant loans</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-500">
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-700">Niveau A — Élite</CardTitle>
              <p className="text-sm text-muted-foreground">Score: 800-850</p>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="text-sm space-y-1">
                <li>• All vehicles access</li>
                <li>• 15% rate discount</li>
                <li>• Vehicle financing eligible</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <section className="p-8 text-center border-t">
        <img src={logo} alt="Dam Flotte" className="h-12 mx-auto mb-4" />
        <p className="text-muted-foreground">
          Dam Flotte - Empowering drivers through technology and fair credit access
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          © 2026 Dam Africa. All rights reserved.
        </p>
      </section>
      </div>
    </div>
  );
};

export default CustomerJourney;
