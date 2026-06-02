import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileUp, X } from 'lucide-react';
import { useUploadAdminAccidentFile } from '@/hooks/useSinistres';
import { toast } from 'sonner';

export function AdminFileUploader({
  accidentId,
  customerId,
  disabled,
}: {
  accidentId: string;
  customerId?: string | null;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAdminAccidentFile();
  const [queue, setQueue] = useState<string[]>([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setQueue(arr.map((f) => f.name));
    for (const f of arr) {
      try {
        await upload.mutateAsync({ accidentId, file: f, customerId, checklistTag: 'admin_upload' });
        setQueue((q) => q.filter((n) => n !== f.name));
      } catch (e: any) {
        toast.error(`Échec: ${f.name}`, { description: e.message });
        setQueue((q) => q.filter((n) => n !== f.name));
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || upload.isPending}
        className="w-full"
      >
        {upload.isPending ? <FileUp className="h-4 w-4 mr-2 animate-pulse" /> : <Upload className="h-4 w-4 mr-2" />}
        {upload.isPending ? 'Envoi en cours…' : 'Ajouter un fichier (admin)'}
      </Button>
      {queue.length > 0 && (
        <div className="space-y-1">
          {queue.map((n) => (
            <div key={n} className="text-xs text-muted-foreground flex items-center gap-1">
              <FileUp className="h-3 w-3 animate-pulse" /> {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
