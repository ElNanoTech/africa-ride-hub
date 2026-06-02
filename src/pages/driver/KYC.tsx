import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileCheck, AlertCircle, Building2, CreditCard, ChevronRight, Clock, XCircle, CheckCircle, ShieldCheck, FileText, Smartphone, Camera, Image, Loader2, Home, RefreshCw } from 'lucide-react';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HapticButton } from '@/components/HapticButton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { KYC, UI } from '@/lib/i18n';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { triggerConfetti } from '@/hooks/useConfetti';
import { compressImage } from '@/lib/imageCompression';

// User-friendly page title (not "KYC")
const PAGE_TITLE = "Vérification d'identité";

// Fullscreen upload overlay component
interface UploadOverlayProps {
  isVisible: boolean;
  progress: number;
  currentStep: string;
}

function UploadOverlay({ isVisible, progress, currentStep }: UploadOverlayProps) {
  if (!isVisible) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* Animated upload icon */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
        </div>
        
        {/* Status text */}
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            Envoi en cours...
          </h3>
          <p className="text-sm text-muted-foreground">
            {currentStep}
          </p>
        </div>
        
        {/* Progress bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progress}% complété
          </p>
        </div>
        
        {/* Tip */}
        <p className="text-xs text-muted-foreground">
          Veuillez ne pas fermer cette page
        </p>
      </div>
    </div>
  );
}

interface FileUploadProps {
  id: string;
  label: string;
  description?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  required?: boolean;
  error?: string | null;
}

// Inline validation checkmark component
function ValidationCheck({ isValid, className }: { isValid: boolean; className?: string }) {
  if (!isValid) return null;
  
  return (
    <div className={cn(
      "inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground animate-scale-in",
      className
    )}>
      <CheckCircle className="h-3.5 w-3.5" />
    </div>
  );
}

function FileUpload({ id, label, description, file, onFileChange, required, error }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const hasError = !!error;

  // Generate preview URL when file changes
  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);
  
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const [isCompressing, setIsCompressing] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    if (selectedFile) {
      // Auto-compress large images
      if (selectedFile.size > MAX_FILE_SIZE && selectedFile.type.startsWith('image/')) {
        setIsCompressing(true);
        try {
          const compressed = await compressImage(selectedFile);
          setIsCompressing(false);
          if (compressed.size > MAX_FILE_SIZE) {
            toast.error('Fichier trop volumineux', {
              description: `Impossible de compresser en dessous de 5 Mo. Veuillez choisir une image plus petite.`,
            });
            e.target.value = '';
            return;
          }
          toast.success('Image compressée', {
            description: `${(selectedFile.size / 1024 / 1024).toFixed(1)} Mo → ${(compressed.size / 1024 / 1024).toFixed(1)} Mo`,
          });
          onFileChange(compressed);
          return;
        } catch {
          setIsCompressing(false);
          toast.error('Erreur de compression', {
            description: 'Veuillez réessayer ou choisir un fichier plus petit.',
          });
          e.target.value = '';
          return;
        }
      }
      // Non-image files over limit
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast.error('Fichier trop volumineux', {
          description: `La taille maximale est de 5 Mo. Votre fichier fait ${(selectedFile.size / 1024 / 1024).toFixed(1)} Mo.`,
        });
        e.target.value = '';
        return;
      }
      onFileChange(selectedFile);
    }
  };

  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = () => {
    onFileChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const isComplete = !!file;
  const isImage = file?.type.startsWith('image/');
  const isPdf = file?.type === 'application/pdf';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="flex items-center gap-1">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <ValidationCheck isValid={isComplete} />
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept="image/*,.pdf"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      
      {file ? (
        // File preview when uploaded
        <div className="border-2 rounded-xl overflow-hidden transition-all border-primary bg-primary/5">
          {/* Image thumbnail preview */}
          {isImage && previewUrl && (
            <div className="relative bg-muted/30">
              <img 
                src={previewUrl} 
                alt="Aperçu du document"
                className="w-full h-48 object-contain"
              />
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                  <CheckCircle className="h-3 w-3 mr-1 text-primary" />
                  Image prête
                </Badge>
              </div>
            </div>
          )}
          
          {/* PDF indicator (no preview) */}
          {isPdf && (
            <div className="h-32 bg-muted/30 flex items-center justify-center">
              <div className="text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <span className="text-sm text-muted-foreground">Document PDF</span>
              </div>
            </div>
          )}
          
          {/* File info and remove button */}
          <div className="p-3 flex items-center justify-between gap-3 border-t border-primary/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} Ko
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="text-muted-foreground hover:text-destructive flex-shrink-0"
            >
              Changer
            </Button>
          </div>
        </div>
      ) : (
        // Upload options when no file
        <div className="space-y-2">
          <div className={cn(
            "grid grid-cols-2 gap-3",
            hasError && "ring-2 ring-destructive/50 rounded-xl"
          )}>
            {/* Camera capture button */}
            <button
              type="button"
              onClick={handleCameraCapture}
              className={cn(
                "flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed transition-all",
                hasError 
                  ? "border-destructive/50 bg-destructive/5 hover:border-destructive hover:bg-destructive/10"
                  : "border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                hasError ? "bg-destructive/20" : "bg-primary/20"
              )}>
                <Camera className={cn("h-6 w-6", hasError ? "text-destructive" : "text-primary")} />
              </div>
              <span className={cn("text-sm font-medium", hasError ? "text-destructive" : "text-primary")}>Prendre photo</span>
            </button>
            
            {/* File select button */}
            <button
              type="button"
              onClick={handleFileSelect}
              className={cn(
                "flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed transition-all",
                hasError 
                  ? "border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                hasError ? "bg-destructive/10" : "bg-muted"
              )}>
                <Image className={cn("h-6 w-6", hasError ? "text-destructive/70" : "text-muted-foreground")} />
              </div>
              <span className={cn("text-sm font-medium", hasError ? "text-destructive/70" : "text-muted-foreground")}>Choisir fichier</span>
            </button>
          </div>
          {/* Inline error message */}
          {hasError && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Progress Stepper Component
interface StepperProps {
  currentStep: 1 | 2;
  step1Complete: boolean;
  step2Complete: boolean;
}

function ProgressStepper({ currentStep, step1Complete, step2Complete }: StepperProps) {
  const steps = [
    { number: 1, label: 'Documents', icon: FileText, complete: step1Complete },
    { number: 2, label: 'Compte mobile', icon: Smartphone, complete: step2Complete },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = currentStep === step.number;
        const isComplete = step.complete;
        
        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                isComplete ? "bg-primary text-primary-foreground" :
                isActive ? "bg-primary/20 text-primary border-2 border-primary" :
                "bg-muted text-muted-foreground"
              )}>
                {isComplete ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span className={cn(
                "text-xs mt-1 font-medium",
                isActive || isComplete ? "text-primary" : "text-muted-foreground"
              )}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                "w-12 h-0.5 mx-2 mb-5",
                step1Complete ? "bg-primary" : "bg-muted"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Welcome Banner for first-time users
function WelcomeBanner() {
  const [isFirstTime, setIsFirstTime] = useState(() => !localStorage.getItem('kyc-page-visited'));
  
  useEffect(() => {
    if (isFirstTime) {
      localStorage.setItem('kyc-page-visited', 'true');
    }
  }, [isFirstTime]);
  
  if (!isFirstTime) return null;
  
  return (
    <Card className="mb-6 border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">Bienvenue ! 🎉</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Pour votre sécurité et celle de la flotte, nous devons vérifier votre identité. 
              C'est simple et rapide : <strong>2 étapes</strong> en moins de 2 minutes !
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type KYCStatus = 'pending' | 'approved' | 'rejected' | 'not_submitted' | 'verified';

export default function KYCPage() {
  const navigate = useNavigate();
  const { driverProfile } = useDriverAuth();
  const driverId = driverProfile?.id;
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  
  // Form state
  const [idProof, setIdProof] = useState<File | null>(null);
  const [license, setLicense] = useState<File | null>(null);
  const [mobileProvider, setMobileProvider] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  
  // Mobile money providers (static list)
  const MOBILE_PROVIDERS = [
    { code: 'wave', name: 'Wave' },
    { code: 'orange_money', name: 'Orange Money' },
    { code: 'moov_money', name: 'Moov Money' },
    { code: 'mtn', name: 'MTN Mobile Money' },
  ];
  
  // Validation errors
  const errors = {
    idProof: !idProof ? "La pièce d'identité est requise" : null,
    mobileProvider: !mobileProvider ? "Veuillez sélectionner un opérateur" : null,
    mobileNumber: !mobileNumber ? "Le numéro mobile est requis" : mobileNumber.length < 8 ? "Le numéro doit contenir au moins 8 chiffres" : null,
  };

  const banksLoading = false; // No async loading needed for static list

  // Fetch existing KYC submission
  const { data: kycSubmission, isLoading: kycLoading } = useQuery({
    queryKey: ['kyc-submission', driverId],
    queryFn: async () => {
      if (!driverId) return null;
      
      const { data, error } = await supabase
        .from('kyc_submissions')
        .select('*')
        .eq('driver_id', driverId)
        .order('submitted_at', { ascending: false })
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!driverId
  });

  // Determine KYC status - also check driver profile kyc_status for immediate feedback
  const kycStatus: KYCStatus = submissionComplete 
    ? 'pending' 
    : (kycSubmission?.status as KYCStatus) || (driverProfile?.kycStatus === 'pending' ? 'pending' : 'not_submitted');

  const canSubmit = idProof && mobileProvider && mobileNumber.length >= 8;

  const uploadFile = async (
    file: File, 
    folder: string, 
    onProgress: (loaded: number, total: number) => void
  ): Promise<string> => {
    if (!driverId) throw new Error('Driver ID not found');
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}_${Date.now()}.${fileExt}`;
    const filePath = `${driverId}/${fileName}`;
    
    // Use Supabase SDK for reliable authenticated upload
    const { data, error } = await supabase.storage
      .from('kyc-documents')
      .upload(filePath, file, { upsert: true });
    
    if (error) {
      console.error('Storage upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }
    
    // Simulate progress completion for UI feedback
    onProgress(file.size, file.size);
    
    // Get signed URL for private bucket
    const { data: urlData } = await supabase.storage
      .from('kyc-documents')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year expiry
    
    return urlData?.signedUrl || filePath;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);

    // Avoid silent no-op states
    if (!driverId) {
      toast.error("Session expirée. Veuillez vous reconnecter.");
      navigate('/driver/login');
      return;
    }

    // Check for validation errors
    const hasErrors = Object.values(errors).some(err => err !== null);
    if (hasErrors) {
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadStep('Préparation de l\'envoi...');
    
    // Calculate total bytes to upload
    const idProofSize = idProof?.size || 0;
    const licenseSize = license?.size || 0;
    const totalBytes = idProofSize + licenseSize;
    let uploadedBytes = 0;
    
    try {
      // Step 1: Upload ID proof with real progress
      setUploadStep('Téléchargement de la pièce d\'identité...');
      const idProofUrl = await uploadFile(idProof!, 'id_proof', (loaded, total) => {
        const currentProgress = Math.round((loaded / totalBytes) * 60);
        setUploadProgress(currentProgress);
      });
      uploadedBytes += idProofSize;
      
      // Step 2: Upload license if provided with real progress
      let licenseUrl: string | null = null;
      if (license) {
        setUploadStep('Téléchargement du permis de conduire...');
        licenseUrl = await uploadFile(license, 'license', (loaded, total) => {
          const baseProgress = Math.round((uploadedBytes / totalBytes) * 60);
          const currentProgress = baseProgress + Math.round((loaded / totalBytes) * 60);
          setUploadProgress(Math.min(currentProgress, 60));
        });
      }
      setUploadProgress(60);
      
      // Step 3: Save to database (60-90%)
      setUploadStep('Enregistrement des informations...');
      
      // Get mobile provider display name
      const selectedProvider = MOBILE_PROVIDERS.find(p => p.code === mobileProvider);
      const providerDisplayName = selectedProvider?.name || mobileProvider;
      
      // Get driver's customer_id for multi-tenant support
      const driverCustomerId = driverProfile?.customer_id || null;
      
      // Insert KYC submission (repurpose bank_name/bank_account_number for mobile money)
      setUploadProgress(70);
      const { error: insertError } = await supabase
        .from('kyc_submissions')
        .insert({
          driver_id: driverId,
          customer_id: driverCustomerId,
          id_proof_url: idProofUrl,
          license_url: licenseUrl,
          bank_name: providerDisplayName,
          bank_account_number: mobileNumber,
          status: 'pending'
        });
      
      if (insertError) throw insertError;
      
      setUploadProgress(85);
      
      // Update driver's KYC status
      const { error: updateError } = await supabase
        .from('drivers')
        .update({ kyc_status: 'pending' })
        .eq('id', driverId);
      
      if (updateError) {
        console.warn('Failed to update driver KYC status:', updateError);
      }
      
      // Step 4: Finalizing (90-100%)
      setUploadStep('Finalisation...');
      setUploadProgress(95);
      
      // Show success toast immediately
      toast.success('Documents soumis avec succès!', {
        description: 'Votre demande est en cours de traitement.'
      });
      
      // Clear form state
      setIdProof(null);
      setLicense(null);
      setMobileProvider('');
      setMobileNumber('');
      
      setUploadProgress(100);
      
      // Small delay to show 100% before transitioning
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // CRITICAL: Set submission complete to trigger UI change
      setSubmissionComplete(true);
      setIsSubmitting(false);
      
      // Send notification to admins (non-blocking)
      supabase.functions.invoke('notify-kyc-submission', {
        body: {
          driverId,
          driverName: driverProfile?.fullName || 'Conducteur',
          driverPhone: driverProfile?.phoneNumber || '',
          submittedAt: new Date().toISOString(),
        }
      }).catch(notifyError => {
        console.warn('Failed to send KYC notification:', notifyError);
      });
      
      // Refresh queries in background (non-blocking)
      queryClient.invalidateQueries({ queryKey: ['kyc-submission', driverId] });
      queryClient.invalidateQueries({ queryKey: ['driver-profile'] });
      queryClient.invalidateQueries({ queryKey: ['driverProfile'] });
      queryClient.invalidateQueries({ queryKey: ['driver-onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['driver'] });
      
      return;
      
    } catch (error: any) {
      console.error('KYC submission error:', error);
      toast.error(error.message || 'Erreur lors de la soumission');
      setIsSubmitting(false);
      setUploadProgress(0);
      setUploadStep('');
    }
  };

  // Real-time subscription for KYC status updates
  useEffect(() => {
    if (!driverId || (kycStatus !== 'pending' && !submissionComplete)) return;
    
    const channel = supabase
      .channel(`kyc-status-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'kyc_submissions',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const newStatus = (payload.new as { status?: string }).status;
          
          if (newStatus === 'approved' || newStatus === 'verified') {
            triggerConfetti();
            toast.success('🎉 KYC Approuvé!', {
              description: 'Votre identité a été vérifiée avec succès!',
              duration: 6000,
            });
            queryClient.invalidateQueries({ queryKey: ['kyc-submission', driverId] });
            queryClient.invalidateQueries({ queryKey: ['driver-profile'] });
          } else if (newStatus === 'rejected') {
            toast.error('Vérification refusée', {
              description: 'Veuillez consulter les détails.',
              duration: 6000,
            });
            queryClient.invalidateQueries({ queryKey: ['kyc-submission', driverId] });
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, kycStatus, submissionComplete, queryClient]);

  // Calculate step completion for stepper
  const step1Complete = !!idProof;
  const step2Complete = !!mobileProvider && mobileNumber.length >= 8;
  const currentStep: 1 | 2 = step1Complete ? 2 : 1;

  // Loading state
  if (kycLoading || banksLoading) {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: PAGE_TITLE }]} />
        <PageHeader title={PAGE_TITLE} />
        <div className="px-4 pb-6 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </DriverLayout>
    );
  }

  // Show status page if already submitted or just completed submission
  if (kycStatus === 'pending' || submissionComplete) {
    const submittedDate = kycSubmission?.submitted_at 
      ? new Date(kycSubmission.submitted_at)
      : new Date();
    
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: PAGE_TITLE }]} />
        <PageHeader title={PAGE_TITLE} />
        <div className="px-4 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {/* Header with gradient */}
                <div className="bg-gradient-to-br from-warning/20 via-warning/10 to-background p-8 text-center">
                  <motion.div 
                    className="relative mx-auto w-20 h-20 mb-4"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  >
                    {/* Animated rings */}
                    <div className="absolute inset-0 rounded-full bg-warning/20 animate-ping" style={{ animationDuration: '2s' }} />
                    <div className="absolute inset-2 rounded-full bg-warning/30 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
                    <div className="relative w-20 h-20 rounded-full bg-warning/10 border-2 border-warning/30 flex items-center justify-center">
                      <Clock className="h-10 w-10 text-warning" />
                    </div>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h2 className="text-2xl font-bold mb-2 text-foreground">En cours de vérification</h2>
                    <p className="text-muted-foreground max-w-xs mx-auto">
                      Notre équipe examine vos documents. Vous serez notifié dès la fin du processus.
                    </p>
                  </motion.div>
                </div>
                
                {/* Status details */}
                <div className="p-6 space-y-6">
                  {/* Live status indicator */}
                  <motion.div 
                    className="flex items-center justify-center gap-3 p-4 rounded-xl bg-muted/50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div className="relative">
                      <div className="w-3 h-3 rounded-full bg-warning animate-pulse" />
                      <div className="absolute inset-0 w-3 h-3 rounded-full bg-warning/50 animate-ping" />
                    </div>
                    <span className="text-sm font-medium">Statut en temps réel</span>
                    <Badge variant="outline" className="border-warning text-warning ml-auto">
                      En attente
                    </Badge>
                  </motion.div>
                  
                  {/* Timeline */}
                  <motion.div 
                    className="space-y-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Documents soumis</p>
                        <p className="text-xs text-muted-foreground">
                          {submittedDate.toLocaleDateString('fr-FR', { 
                            day: 'numeric', 
                            month: 'long', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-warning/20 border-2 border-warning flex items-center justify-center">
                        <RefreshCw className="h-4 w-4 text-warning animate-spin" style={{ animationDuration: '3s' }} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Vérification en cours</p>
                        <p className="text-xs text-muted-foreground">Délai estimé: 24-48h</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 opacity-40">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Identité vérifiée</p>
                        <p className="text-xs text-muted-foreground">En attente...</p>
                      </div>
                    </div>
                  </motion.div>
                  
                  {/* Actions */}
                  <motion.div 
                    className="pt-4 space-y-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <HapticButton 
                      className="w-full" 
                      onClick={() => navigate('/driver')} 
                      hapticType="light"
                    >
                      <Home className="h-4 w-4 mr-2" />
                      Retour à l'accueil
                    </HapticButton>
                    
                    <HapticButton 
                      className="w-full" 
                      variant="outline"
                      onClick={() => navigate('/driver/notifications')} 
                      hapticType="light"
                    >
                      Voir mes notifications
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </HapticButton>
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          
          {/* Tips card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mt-4"
          >
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">Bon à savoir</p>
                    <p className="text-xs text-muted-foreground">
                      Vous recevrez une notification push dès que votre vérification sera terminée. 
                      Assurez-vous d'activer les notifications pour ne rien manquer!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </DriverLayout>
    );
  }

  if (kycStatus === 'approved' || kycStatus === 'verified') {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: PAGE_TITLE }]} />
        <PageHeader title={PAGE_TITLE} />
        <div className="px-4 pb-6">
          <Card>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileCheck className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">Identité vérifiée ✓</h2>
              <p className="text-muted-foreground mb-6">
                Votre identité a été vérifiée. Vous pouvez maintenant louer des véhicules et demander des prêts.
              </p>
              <Badge variant="default" className="bg-primary">
                Vérifié
              </Badge>
              <HapticButton className="mt-6" onClick={() => navigate('/driver/vehicles')} hapticType="success">
                Voir les véhicules
                <ChevronRight className="h-4 w-4 ml-1" />
              </HapticButton>
            </CardContent>
          </Card>
        </div>
      </DriverLayout>
    );
  }

  if (kycStatus === 'rejected') {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: PAGE_TITLE }]} />
        <PageHeader title={PAGE_TITLE} />
        <div className="px-4 pb-6">
          <Card className="border-destructive/50">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-xl font-bold mb-2">Vérification refusée</h2>
              <p className="text-muted-foreground mb-4">
                {kycSubmission?.rejection_reason || "Vos documents n'ont pas pu être vérifiés. Veuillez soumettre à nouveau."}
              </p>
              <Badge variant="destructive">Refusé</Badge>
              <HapticButton 
                className="mt-6" 
                onClick={() => {
                  // Reset form to allow resubmission
                  queryClient.setQueryData(['kyc-submission', driverId], null);
                }} 
                hapticType="light"
              >
                Soumettre à nouveau
              </HapticButton>
            </CardContent>
          </Card>
        </div>
      </DriverLayout>
    );
  }

  return (
    <>
      {/* Upload progress overlay */}
      <UploadOverlay 
        isVisible={isSubmitting} 
        progress={uploadProgress} 
        currentStep={uploadStep} 
      />
      
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: PAGE_TITLE }]} />
        <PageHeader 
          title={PAGE_TITLE} 
          subtitle="Simple et rapide en 2 étapes"
        />
        
        <div className="px-4 pb-6">
        {/* Welcome Banner for first-time users */}
        <WelcomeBanner />
        
        {/* Progress Stepper */}
        <ProgressStepper 
          currentStep={currentStep} 
          step1Complete={step1Complete} 
          step2Complete={step2Complete} 
        />

        <form onSubmit={handleSubmit}>
          {/* Step 1: Document Uploads */}
          <Card className={cn("mb-4 transition-all", currentStep === 1 && "ring-2 ring-primary/20")}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  step1Complete ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
                )}>
                  {step1Complete ? <CheckCircle className="h-4 w-4" /> : "1"}
                </div>
                <CardTitle className="text-lg">Documents d'identité</CardTitle>
              </div>
              <CardDescription>Téléchargez vos pièces justificatives</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FileUpload
                id="id-proof"
                label={KYC.ID_PROOF}
                description="Carte d'identité nationale, passeport ou permis de séjour"
                file={idProof}
                onFileChange={setIdProof}
                required
                error={showErrors ? errors.idProof : null}
              />
              
              <FileUpload
                id="license"
                label={KYC.LICENSE}
                description={KYC.UPLOAD_LICENSE}
                file={license}
                onFileChange={setLicense}
              />
            </CardContent>
          </Card>

          {/* Step 2: Mobile Money Account */}
          <Card className={cn("mb-6 transition-all", currentStep === 2 && "ring-2 ring-primary/20")}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  step2Complete ? "bg-primary text-primary-foreground" : 
                  step1Complete ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {step2Complete ? <CheckCircle className="h-4 w-4" /> : "2"}
                </div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Compte mobile
                </CardTitle>
              </div>
              <CardDescription>Pour recevoir vos paiements via mobile money</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="provider" className="flex items-center gap-1">
                    Opérateur mobile
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <ValidationCheck isValid={!!mobileProvider} />
                </div>
                <Select value={mobileProvider} onValueChange={setMobileProvider}>
                  <SelectTrigger 
                    id="provider" 
                    className={cn(
                      mobileProvider && "border-primary/50",
                      showErrors && errors.mobileProvider && "border-destructive ring-1 ring-destructive/50"
                    )}
                  >
                    <SelectValue placeholder="Sélectionnez un opérateur" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOBILE_PROVIDERS.map((provider) => (
                      <SelectItem key={provider.code} value={provider.code}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showErrors && errors.mobileProvider && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {errors.mobileProvider}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="mobile-number" className="flex items-center gap-1">
                    Numéro mobile
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <ValidationCheck isValid={mobileNumber.length >= 8} />
                </div>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="mobile-number"
                    type="tel"
                    inputMode="numeric"
                    placeholder="07 XX XX XX XX"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                    className={cn(
                      "pl-10", 
                      mobileNumber.length >= 8 && "border-primary/50",
                      showErrors && errors.mobileNumber && "border-destructive ring-1 ring-destructive/50"
                    )}
                    maxLength={15}
                  />
                </div>
                {showErrors && errors.mobileNumber ? (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {errors.mobileNumber}
                  </p>
                ) : mobileNumber.length > 0 && mobileNumber.length < 8 ? (
                  <p className="text-xs text-muted-foreground">
                    {8 - mobileNumber.length} chiffres restants
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <HapticButton
            type="submit"
            size="lg"
            className="w-full"
            disabled={!canSubmit || isSubmitting}
            hapticType="success"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                {UI.LOADING}
              </div>
            ) : (
              <>
                <ShieldCheck className="h-5 w-5 mr-2" />
                Soumettre ma vérification
              </>
            )}
          </HapticButton>
        </form>
      </div>
    </DriverLayout>
    </>
  );
}