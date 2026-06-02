import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileUp, AlertCircle } from 'lucide-react';
import { useUploadAccidentFile, useAccident } from '@/hooks/useSinistres';
import { toast } from 'sonner';

/**
 * Driver-facing CTA shown on the case detail page when status === WAITING_DOCS.
 * Lets the driver attach more photos / scans without leaving the case view.
 */
export function UploadMissingDocs({ accidentId }: { accidentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAccidentFile();
  const { data: accident } = useAccident(accidentId);

  if (!accident || accident.status !== 'WAITING_DOCS') return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    let ok = 0;
    for (const f of arr) {
      try {
        await upload.mutateAsync({ accidentId, file: f, checklistTag: 'driver_response' });
        ok++;
      } catch (e: any) {
        toast.error(`Échec: ${f.name}`, { description: e.message });
      }
    }
    if (ok > 0) toast.success(`${ok} document(s) envoyé(s)`, { description: 'L\'équipe a été notifiée.' });
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm">Documents requis</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Notre équipe attend des informations supplémentaires. Voir le commentaire ci-dessous et envoyez les documents demandés.
            </p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          size="lg"
          className="w-full"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <FileUp className="h-4 w-4 mr-2 animate-pulse" /> : <Upload className="h-4 w-4 mr-2" />}
          {upload.isPending ? 'Envoi…' : 'Envoyer les documents'}
        </Button>
      </CardContent>
    </Card>
  );
}
