import { useNavigate, useParams } from 'react-router-dom';
import { useRef } from 'react';
import { ArrowRight, Camera, Upload, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AccidentWizardLayout } from '@/components/sinistres/AccidentWizardLayout';
import { useAccidentFiles, useUploadAccidentFile, useDeleteAccidentFile } from '@/hooks/useSinistres';
import { toast } from 'sonner';

const MIN_PHOTOS = 1;

export default function StepEvidence() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: files = [] } = useAccidentFiles(id);
  const upload = useUploadAccidentFile();
  const del = useDeleteAccidentFile();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const photoCount = files.filter((f) => f.file_type === 'PHOTO').length;
  const canContinue = photoCount >= MIN_PHOTOS;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !id) return;
    for (const file of Array.from(fileList)) {
      try {
        await upload.mutateAsync({ accidentId: id, file });
      } catch (e: any) {
        toast.error(`Échec: ${file.name}`, { description: e.message });
      }
    }
  };

  return (
    <AccidentWizardLayout
      step="evidence"
      footer={
        <Button
          size="lg"
          className="w-full h-14 text-base"
          onClick={() => navigate(`/driver/sinistres/report/${id}/location`)}
          disabled={!canContinue}
        >
          {canContinue
            ? `Continuer (${photoCount} photo${photoCount > 1 ? 's' : ''})`
            : 'Ajoutez au moins 1 photo'}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      }
    >
      <div className="max-w-md mx-auto space-y-4">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="text-center pt-2">
          <h2 className="text-xl font-bold">Prenez des photos</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Au moins <strong>1 photo</strong> des dégâts. Ajoutez-en plus si possible (autre véhicule, scène).
          </p>
        </div>

        <Card className={canContinue ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'}>
          <CardContent className="p-3 flex items-center gap-2 text-sm">
            {canContinue ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>Vous pouvez continuer ({photoCount} photo{photoCount > 1 ? 's' : ''})</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-warning" />
                <span>Ajoutez au moins 1 photo</span>
              </>
            )}
          </CardContent>
        </Card>

        <Button size="lg" className="w-full h-16 text-base" onClick={() => cameraRef.current?.click()}>
          <Camera className="h-6 w-6 mr-2" /> Prendre une photo
        </Button>
        <Button size="lg" variant="outline" className="w-full h-12" onClick={() => galleryRef.current?.click()}>
          <Upload className="h-5 w-5 mr-2" /> Choisir depuis la galerie
        </Button>

        {files.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Vos photos ({files.length})</h3>
            <div className="grid grid-cols-3 gap-2">
              {files.map((f) => (
                <Card key={f.id} className="relative overflow-hidden aspect-square">
                  {f.file_type === 'PHOTO' ? (
                    <img src={f.file_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <CardContent className="p-2 h-full flex items-center justify-center text-[10px] text-center">
                      {f.original_filename ?? f.file_type}
                    </CardContent>
                  )}
                  <button
                    onClick={() => del.mutate(f)}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {upload.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Téléchargement...
          </div>
        )}
      </div>
    </AccidentWizardLayout>
  );
}
