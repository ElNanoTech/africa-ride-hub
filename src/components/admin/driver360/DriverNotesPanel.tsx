import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { Trash2, MessageSquarePlus } from 'lucide-react';
import { useAdminUser } from '@/hooks/useAdminUser';

interface DriverNotesPanelProps {
  driverId: string;
  customerId: string | null;
  /** CH-P5 "Ajouter note": bump this counter to focus the note input. */
  focusToken?: number;
}

export function DriverNotesPanel({ driverId, customerId, focusToken }: DriverNotesPanelProps) {
  const qc = useQueryClient();
  const { customerId: scopedCustomer } = useAdminUser();
  const effectiveCustomer = customerId || scopedCustomer;

  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState<'admin' | 'driver' | 'both'>('admin');
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusToken && focusToken > 0) {
      // Wait one frame so the Notes tab content is mounted/visible first.
      requestAnimationFrame(() => noteInputRef.current?.focus());
    }
  }, [focusToken]);

  const { data, isLoading } = useQuery({
    queryKey: ['driver-notes', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_notes')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!effectiveCustomer) throw new Error('Aucun client actif');
      const trimmed = note.trim();
      if (!trimmed) throw new Error('Note vide');
      const { error } = await supabase.from('driver_notes').insert({
        driver_id: driverId,
        customer_id: effectiveCustomer,
        note: trimmed,
        visibility,
      });
      if (error) throw error;
      await supabase.rpc('driver_log', {
        p_driver: driverId,
        p_action: 'note_added',
        p_metadata: { visibility } as never,
      });
    },
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['driver-notes', driverId] });
      qc.invalidateQueries({ queryKey: ['driver-audit', driverId] });
      toast.success('Note ajoutée');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('driver_notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-notes', driverId] });
      toast.success('Note supprimée');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visibilityLabel = (v: string) =>
    v === 'driver' ? 'Chauffeur uniquement' : v === 'both' ? 'Admin + chauffeur' : 'Admin uniquement';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes internes</CardTitle>
        <CardDescription>Observations et commentaires sur le conducteur</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 border rounded-lg p-3">
          <Textarea
            ref={noteInputRef}
            placeholder="Ajouter une note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin uniquement</SelectItem>
                <SelectItem value="driver">Chauffeur uniquement</SelectItem>
                <SelectItem value="both">Admin + chauffeur</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => addNote.mutate()}
              disabled={!note.trim() || addNote.isPending}
              className="ml-auto"
            >
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Aucune note</div>
        ) : (
          <div className="space-y-2">
            {data.map((n) => (
              <div key={n.id} className="border rounded-lg p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px]">{visibilityLabel(n.visibility)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(n.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{n.note}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeNote.mutate(n.id)}
                  disabled={removeNote.isPending}
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}