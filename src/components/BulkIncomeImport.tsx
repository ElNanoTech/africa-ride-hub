import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  Loader2,
  Eye,
  FileWarning,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';

interface ImportRow {
  phone_number?: string;
  driver_id?: string;
  yango_driver_id?: string;
  record_date: string;
  gross_income: number;
  net_income?: number;
  trip_count?: number;
  source?: string;
  notes?: string;
}

interface ValidationResult {
  success: boolean;
  validated: number;
  errors: { row: number; error: string; data: any }[];
  warnings: string[];
  preview: any[];
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: { row: number; error: string; data: any }[];
  warnings: string[];
}

interface BulkIncomeImportProps {
  onImportComplete?: () => void;
  adminUserId?: string;
}

export function BulkIncomeImport({ onImportComplete, adminUserId }: BulkIncomeImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'upload' | 'validate' | 'preview' | 'importing' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const resetState = () => {
    setStep('upload');
    setFile(null);
    setParsedRows([]);
    setValidationResult(null);
    setImportResult(null);
    setIsProcessing(false);
  };

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const text = await selectedFile.text();
      const rows = parseCSV(text);
      
      if (rows.length === 0) {
        toast.error('Fichier vide ou format invalide');
        setIsProcessing(false);
        return;
      }

      setParsedRows(rows);
      setStep('validate');
      
      // Run validation
      const result = await validateRows(rows);
      setValidationResult(result);
      setStep('preview');

    } catch (error) {
      console.error('Parse error:', error);
      toast.error('Erreur lors de la lecture du fichier');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const parseCSV = (text: string): ImportRow[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(/[,;\t]/).map(h => 
      h.trim().toLowerCase()
        .replace(/['"]/g, '')
        .replace(/\s+/g, '_')
        .replace(/téléphone/g, 'phone_number')
        .replace(/date/g, 'record_date')
        .replace(/revenu_brut|brut/g, 'gross_income')
        .replace(/revenu_net|net/g, 'net_income')
        .replace(/courses|trips/g, 'trip_count')
    );

    const rows: ImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,;\t]/).map(v => v.trim().replace(/['"]/g, ''));
      if (values.length < 2) continue;

      const row: any = {};
      headers.forEach((header, idx) => {
        if (values[idx] !== undefined && values[idx] !== '') {
          row[header] = values[idx];
        }
      });

      // Convert numeric fields
      if (row.gross_income) row.gross_income = Number(row.gross_income) || 0;
      if (row.net_income) row.net_income = Number(row.net_income) || 0;
      if (row.trip_count) row.trip_count = Number(row.trip_count) || 0;

      if (row.record_date || row.gross_income) {
        rows.push(row as ImportRow);
      }
    }

    return rows;
  };

  const validateRows = async (rows: ImportRow[]): Promise<ValidationResult> => {
    const { data, error } = await supabase.functions.invoke('import-income', {
      body: { rows, dry_run: true }
    });

    if (error) {
      throw new Error(error.message);
    }

    return data as ValidationResult;
  };

  const handleImport = async () => {
    if (!parsedRows.length) return;

    setStep('importing');
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke('import-income', {
        body: { 
          rows: parsedRows, 
          dry_run: false,
          admin_user_id: adminUserId 
        }
      });

      if (error) throw new Error(error.message);

      setImportResult(data as ImportResult);
      setStep('complete');
      
      if (data.imported > 0) {
        toast.success(`${data.imported} revenus importés avec succès`);
        onImportComplete?.();
      }

    } catch (error) {
      console.error('Import error:', error);
      toast.error('Erreur lors de l\'import');
      setStep('preview');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const template = `phone_number,record_date,gross_income,net_income,trip_count,notes
+221771234567,2025-01-06,25000,20000,15,Journée normale
+221772345678,2025-01-06,30000,24000,18,Bonne journée
+221773456789,2025-01-06,18000,14400,10,Jour calme`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_import_revenus.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadErrorReport = () => {
    if (!importResult?.errors.length) return;

    const report = importResult.errors.map(e => 
      `Ligne ${e.row}: ${e.error}`
    ).join('\n');

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rapport_erreurs_import.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setIsOpen(true)}>
        <Upload className="h-4 w-4" />
        Import CSV
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { 
        if (!open) resetState(); 
        setIsOpen(open); 
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import en masse des revenus
            </DialogTitle>
            <DialogDescription>
              Importez les revenus depuis un fichier CSV ou Excel
            </DialogDescription>
          </DialogHeader>

          <AnimatePresence mode="wait">
            {/* Step 1: Upload */}
            {step === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('csv-upload')?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const droppedFile = e.dataTransfer.files[0];
                    if (droppedFile) handleFileSelect(droppedFile);
                  }}
                >
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm font-medium mb-1">
                    Glissez votre fichier ici ou cliquez pour sélectionner
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Formats acceptés: CSV, XLS, XLSX
                  </p>
                  <input
                    id="csv-upload"
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) handleFileSelect(selectedFile);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-sm">
                    <Download className="h-4 w-4" />
                    <span>Besoin du format?</span>
                  </div>
                  <Button variant="link" size="sm" onClick={downloadTemplate}>
                    Télécharger le template
                  </Button>
                </div>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Colonnes attendues</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1 pb-3">
                    <p><Badge variant="outline">phone_number</Badge> - Numéro de téléphone du conducteur</p>
                    <p><Badge variant="outline">record_date</Badge> - Date (YYYY-MM-DD ou DD/MM/YYYY)</p>
                    <p><Badge variant="outline">gross_income</Badge> - Revenu brut en FCFA</p>
                    <p><Badge variant="outline">net_income</Badge> - Revenu net (optionnel, calculé à 80%)</p>
                    <p><Badge variant="outline">trip_count</Badge> - Nombre de courses (optionnel)</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Step 2: Validating */}
            {step === 'validate' && (
              <motion.div
                key="validate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-8 text-center"
              >
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="font-medium">Validation en cours...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {parsedRows.length} lignes à vérifier
                </p>
              </motion.div>
            )}

            {/* Step 3: Preview */}
            {step === 'preview' && validationResult && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className="bg-green-500/10 border-green-500/20">
                    <CardContent className="p-3 text-center">
                      <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-green-500" />
                      <p className="text-xl font-bold text-green-600">{validationResult.validated}</p>
                      <p className="text-xs text-muted-foreground">Valides</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-amber-500/10 border-amber-500/20">
                    <CardContent className="p-3 text-center">
                      <FileWarning className="h-6 w-6 mx-auto mb-1 text-amber-500" />
                      <p className="text-xl font-bold text-amber-600">{validationResult.warnings.length}</p>
                      <p className="text-xs text-muted-foreground">Avertissements</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="p-3 text-center">
                      <XCircle className="h-6 w-6 mx-auto mb-1 text-red-500" />
                      <p className="text-xl font-bold text-red-600">{validationResult.errors.length}</p>
                      <p className="text-xs text-muted-foreground">Erreurs</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Errors */}
                {validationResult.errors.length > 0 && (
                  <Card className="border-red-200">
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Erreurs ({validationResult.errors.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <ScrollArea className="h-24">
                        <div className="space-y-1 text-xs">
                          {validationResult.errors.slice(0, 10).map((err, i) => (
                            <p key={i} className="text-red-600">
                              <span className="font-medium">Ligne {err.row}:</span> {err.error}
                            </p>
                          ))}
                          {validationResult.errors.length > 10 && (
                            <p className="text-muted-foreground">
                              ... et {validationResult.errors.length - 10} autres erreurs
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Warnings */}
                {validationResult.warnings.length > 0 && (
                  <Card className="border-amber-200">
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm text-amber-600 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Avertissements ({validationResult.warnings.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <ScrollArea className="h-20">
                        <div className="space-y-1 text-xs">
                          {validationResult.warnings.slice(0, 5).map((warn, i) => (
                            <p key={i} className="text-amber-600">{warn}</p>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Preview Table */}
                {validationResult.preview.length > 0 && (
                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Aperçu (10 premières lignes)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <ScrollArea className="h-40">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Brut</TableHead>
                              <TableHead className="text-xs">Net</TableHead>
                              <TableHead className="text-xs">Courses</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {validationResult.preview.map((row, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs py-1">{row.record_date}</TableCell>
                                <TableCell className="text-xs py-1">{row.gross_income?.toLocaleString()}</TableCell>
                                <TableCell className="text-xs py-1">{row.net_income?.toLocaleString()}</TableCell>
                                <TableCell className="text-xs py-1">{row.trip_count}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            )}

            {/* Step 4: Importing */}
            {step === 'importing' && (
              <motion.div
                key="importing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-8 text-center"
              >
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="font-medium">Import en cours...</p>
                <Progress value={50} className="w-48 mx-auto mt-4" />
              </motion.div>
            )}

            {/* Step 5: Complete */}
            {step === 'complete' && importResult && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="text-center py-4">
                  {importResult.imported > 0 ? (
                    <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
                  ) : (
                    <XCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
                  )}
                  <p className="text-xl font-bold">
                    {importResult.imported > 0 ? 'Import terminé!' : 'Import échoué'}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Card className="bg-green-500/10">
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                      <p className="text-xs text-muted-foreground">Importés</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-amber-500/10">
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-amber-600">{importResult.skipped}</p>
                      <p className="text-xs text-muted-foreground">Ignorés</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-500/10">
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-red-600">{importResult.errors.length}</p>
                      <p className="text-xs text-muted-foreground">Erreurs</p>
                    </CardContent>
                  </Card>
                </div>

                {importResult.errors.length > 0 && (
                  <Button variant="outline" className="w-full gap-2" onClick={downloadErrorReport}>
                    <Download className="h-4 w-4" />
                    Télécharger le rapport d'erreurs
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <DialogFooter>
            {step === 'upload' && (
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Annuler
              </Button>
            )}
            {step === 'preview' && validationResult && (
              <>
                <Button variant="outline" onClick={resetState}>
                  Recommencer
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={validationResult.validated === 0 || isProcessing}
                  className="gap-2"
                >
                  Importer {validationResult.validated} revenus
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
            {step === 'complete' && (
              <Button onClick={() => { resetState(); setIsOpen(false); }}>
                Fermer
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
