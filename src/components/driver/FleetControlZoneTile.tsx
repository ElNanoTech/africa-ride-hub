import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2, Camera, CheckCircle2, AlertTriangle, RefreshCw, FileText,
  Image as ImageIcon, Upload, Eye, ImageOff,
} from 'lucide-react';
import type { ItemValidation, ZoneKey } from '@/lib/fleetControl';

export interface ZoneTilePhoto {
  id: string;
  storage_path: string;
  validation_status: ItemValidation;
  rejection_reason: string | null;
}

interface FleetControlZoneTileProps {
  zone: { key: ZoneKey; label: string; help: string };
  kind: 'camera' | 'doc';
  photo?: ZoneTilePhoto | null;
  thumbUrl?: string;
  thumbFailed?: boolean;
  thumbsLoading?: boolean;
  busy?: boolean;
  progress?: number;
  /** Item cannot be (re)uploaded — approved, cycle locked, or review pending. */
  itemLocked?: boolean;
  /** Read-only rendering (history detail): no upload CTAs at all. */
  readOnly?: boolean;
  onView?: () => void;
  onPick?: (kind: 'camera' | 'gallery' | 'document') => void;
  onThumbError?: () => void;
}

/**
 * Presentational tile for one Fleet Control item (photo zone or document).
 * Shared between the active driver screen (VehicleInspection) and the
 * read-only history detail page — keep it free of data-fetching logic.
 */
export function FleetControlZoneTile({
  zone: z,
  kind,
  photo,
  thumbUrl,
  thumbFailed = false,
  thumbsLoading = false,
  busy = false,
  progress = 0,
  itemLocked = false,
  readOnly = false,
  onView,
  onPick,
  onThumbError,
}: FleetControlZoneTileProps) {
  const Icon = kind === 'doc' ? FileText : Camera;
  const rejected = photo?.validation_status === 'rejected';
  const approved = photo?.validation_status === 'approved';
  const isImageThumb = !!thumbUrl && !!photo && !/\.pdf($|\?)/i.test(photo.storage_path);
  const locked = readOnly || itemLocked;
  const isEmpty = !photo;

  return (
    <div
      key={z.key}
      data-rejected={rejected ? 'true' : undefined}
      className={`relative rounded-xl border-2 p-4 text-left min-h-[140px] transition active:scale-[0.98] ${
        rejected
          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30'
          : approved
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
            : photo
              ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-950/20'
              : 'border-dashed border-muted-foreground/40 bg-card'
      } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="font-medium">{z.label}</div>
          {isEmpty && !busy && !readOnly && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
              À envoyer
            </Badge>
          )}
        </div>
        {approved ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : rejected ? (
          <AlertTriangle className="h-5 w-5 text-rose-600" />
        ) : photo ? (
          <CheckCircle2 className="h-5 w-5 text-blue-500" />
        ) : busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <Icon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{z.help}</div>
      {isEmpty && !busy && (
        <div className="mt-2 aspect-video w-full rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 flex flex-col items-center justify-center gap-1 text-muted-foreground">
          {kind === 'doc' ? <FileText className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
          <span className="text-[11px] font-medium">
            {readOnly
              ? 'Non fourni'
              : kind === 'doc' ? 'Aucun document envoyé' : 'Aucune photo envoyée'}
          </span>
        </div>
      )}
      {photo && !thumbFailed && (
        <div className="mt-2 aspect-video w-full rounded-md overflow-hidden bg-muted flex items-center justify-center">
          {isImageThumb ? (
            <img
              src={thumbUrl}
              alt={z.label}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={onThumbError}
            />
          ) : thumbUrl ? (
            <a href={thumbUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center text-xs text-muted-foreground">
              <FileText className="h-6 w-6 mb-1" />
              Ouvrir le document
            </a>
          ) : thumbsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <ImageOff className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      )}
      {thumbFailed && (
        <div className="mt-2 aspect-video w-full rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/30 flex flex-col items-center justify-center gap-1 text-rose-700 dark:text-rose-300">
          <ImageOff className="h-5 w-5" />
          <span className="text-[11px] font-medium">Pièce non disponible</span>
        </div>
      )}
      {busy && (
        <div className="mt-2">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.max(5, progress)}%` }}
            />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
            Envoi… {progress}%
          </div>
        </div>
      )}
      <div className="text-xs mt-2 font-medium">
        {rejected && photo?.rejection_reason
          ? <span className="text-rose-700 dark:text-rose-300">Motif du refus : {photo.rejection_reason}</span>
          : approved
            ? <span className="text-emerald-700 dark:text-emerald-300">Validé par le gestionnaire</span>
          : thumbFailed
            ? <span className="text-rose-700 dark:text-rose-300">{readOnly ? 'Pièce non disponible' : "Photo absente — reprenez l'envoi"}</span>
            : photo && locked
              ? (readOnly ? 'Envoyé' : 'Envoyé — en attente de validation')
              : photo
                ? (kind === 'doc' ? 'Remplacer le document' : 'Modifier la photo')
                : readOnly
                  ? 'Non fourni'
                  : (kind === 'doc' ? 'Ajoutez un document ou une photo' : 'Prenez une photo de cette zone')}
      </div>
      <div className="flex gap-2 mt-3">
        {locked && photo ? (
          onView && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1 h-9"
              onClick={onView}
            >
              <Eye className="h-4 w-4 mr-1" /> Voir la {kind === 'doc' ? 'pièce' : 'photo'}
            </Button>
          )
        ) : readOnly ? null : rejected ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="flex-1 h-9"
            onClick={() => onPick?.(kind === 'doc' ? 'document' : 'camera')}
            disabled={busy}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Reprendre {kind === 'doc' ? 'le document' : 'la photo'}
          </Button>
        ) : kind === 'camera' ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="flex-1 h-9"
              onClick={() => onPick?.('camera')}
              disabled={busy}
            >
              <Camera className="h-4 w-4 mr-1" /> Photo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 px-3"
              onClick={() => onPick?.('gallery')}
              disabled={busy}
              aria-label="Choisir depuis la galerie"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="flex-1 h-9"
              onClick={() => onPick?.('document')}
              disabled={busy}
            >
              <Upload className="h-4 w-4 mr-1" /> Fichier
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 px-3"
              onClick={() => onPick?.('camera')}
              disabled={busy}
              aria-label="Photographier le document"
            >
              <Camera className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
