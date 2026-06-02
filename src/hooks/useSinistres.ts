import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { compressImage } from '@/lib/imageCompression';
import { ACCIDENT_BUCKET, AccidentStatus, AccidentSeverity, FileType, PartyType, fileTypeFromMime } from '@/lib/sinistres';
import { toast } from 'sonner';
import ngeohash from 'ngeohash';

// Use loose typing — the regenerated Supabase types may not yet include the new
// tables in the editor's local cache. The DB & RLS are the source of truth.
const sb = supabase as any;

export interface AccidentRecord {
  id: string;
  case_number: string | null;
  customer_id: string | null;
  driver_id: string;
  vehicle_id: string | null;
  rental_id: string | null;
  status: AccidentStatus;
  severity: AccidentSeverity;
  accident_datetime: string;
  description: string | null;
  police_involved: boolean;
  injury_involved: boolean;
  other_party_involved: boolean;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  location_geohash: string | null;
  city: string | null;
  region: string | null;
  assigned_admin_id: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  closed_at: string | null;
}

export interface AccidentFile {
  id: string;
  accident_id: string;
  file_type: FileType;
  file_url: string;
  thumbnail_url: string | null;
  mime_type: string | null;
  original_filename: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  checklist_tag: string | null;
  created_at: string;
}

export interface AccidentParty {
  id: string;
  accident_id: string;
  party_type: PartyType;
  name: string | null;
  phone: string | null;
  plate: string | null;
  vehicle_info: string | null;
  insurer: string | null;
  insurance_policy: string | null;
  report_number: string | null;
  officer_department: string | null;
  notes: string | null;
}

// =========================================================
// DRIVER HOOKS
// =========================================================

/** Get the driver's currently open draft, if any. */
export function useDriverAccidentDraft() {
  const { driverProfile } = useDriverAuth();
  return useQuery({
    queryKey: ['accident-draft', driverProfile?.id],
    enabled: !!driverProfile?.id,
    queryFn: async (): Promise<AccidentRecord | null> => {
      const { data, error } = await sb
        .from('accidents')
        .select('*')
        .eq('driver_id', driverProfile!.id)
        .eq('status', 'DRAFT')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as AccidentRecord) || null;
    },
  });
}

/**
 * Returns the driver's *currently active* rental, if any.
 * A driver must have one to be allowed to declare an accident — the accident
 * is automatically tied to that rental and its vehicle.
 */
export function useDriverActiveRental() {
  const { driverProfile } = useDriverAuth();
  return useQuery({
    queryKey: ['driver-active-rental', driverProfile?.id],
    enabled: !!driverProfile?.id,
    queryFn: async () => {
      const { data, error } = await sb
        .from('rentals')
        .select('id, vehicle_id, status, vehicle:vehicles(id, license_plate, model_name)')
        .eq('driver_id', driverProfile!.id)
        .in('status', ['active', 'approved', 'paid', 'payment_overdue', 'overdue_return'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; vehicle_id: string | null; status: string; vehicle?: { id: string; license_plate: string | null; model_name: string | null } | null } | null;
    },
  });
}

/** List all of the driver's accidents. */
export function useDriverAccidents() {
  const { driverProfile } = useDriverAuth();
  return useQuery({
    queryKey: ['accidents', driverProfile?.id],
    enabled: !!driverProfile?.id,
    queryFn: async (): Promise<AccidentRecord[]> => {
      const { data, error } = await sb
        .from('accidents')
        .select('*')
        .eq('driver_id', driverProfile!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as AccidentRecord[]) || [];
    },
  });
}

export function useAccident(id: string | undefined) {
  return useQuery({
    queryKey: ['accident', id],
    enabled: !!id,
    queryFn: async (): Promise<AccidentRecord> => {
      const { data, error } = await sb.from('accidents').select('*').eq('id', id).single();
      if (error) throw error;
      return data as AccidentRecord;
    },
  });
}

export function useAccidentFiles(accidentId: string | undefined) {
  return useQuery({
    queryKey: ['accident-files', accidentId],
    enabled: !!accidentId,
    queryFn: async (): Promise<AccidentFile[]> => {
      const { data, error } = await sb
        .from('accident_files')
        .select('*')
        .eq('accident_id', accidentId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as AccidentFile[]) || [];
    },
  });
}

export function useAccidentParties(accidentId: string | undefined) {
  return useQuery({
    queryKey: ['accident-parties', accidentId],
    enabled: !!accidentId,
    queryFn: async (): Promise<AccidentParty[]> => {
      const { data, error } = await sb
        .from('accident_parties')
        .select('*')
        .eq('accident_id', accidentId)
        .order('party_type', { ascending: true });
      if (error) throw error;
      return (data as AccidentParty[]) || [];
    },
  });
}

export function useAccidentTimeline(accidentId: string | undefined) {
  return useQuery({
    queryKey: ['accident-timeline', accidentId],
    enabled: !!accidentId,
    queryFn: async () => {
      const [history, activity, notes] = await Promise.all([
        sb.from('accident_status_history').select('*').eq('accident_id', accidentId).order('created_at', { ascending: false }),
        sb.from('accident_activity').select('*').eq('accident_id', accidentId).order('created_at', { ascending: false }),
        sb.from('accident_notes').select('*').eq('accident_id', accidentId).order('created_at', { ascending: false }),
      ]);
      return {
        history: history.data || [],
        activity: activity.data || [],
        notes: notes.data || [],
      };
    },
  });
}

/**
 * Create a new draft accident. Auto-attaches the driver's active rental + vehicle.
 * Throws "no_active_rental" if the driver has none — the UI must gate before calling.
 */
export function useCreateAccidentDraft() {
  const { driverProfile } = useDriverAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (initial?: Partial<AccidentRecord>): Promise<string> => {
      if (!driverProfile?.id) throw new Error('Not authenticated');

      // Resolve the driver's active rental → required.
      const { data: rental, error: rErr } = await sb
        .from('rentals')
        .select('id, vehicle_id')
        .eq('driver_id', driverProfile.id)
        .in('status', ['active', 'approved', 'paid', 'payment_overdue', 'overdue_return'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!rental) {
        const e: any = new Error('Aucune location active. Vous devez avoir un véhicule en location pour déclarer un accident.');
        e.code = 'no_active_rental';
        throw e;
      }

      const payload = {
        driver_id: driverProfile.id,
        customer_id: driverProfile.customer_id ?? null,
        rental_id: rental.id,
        vehicle_id: rental.vehicle_id ?? null,
        status: 'DRAFT',
        severity: 'UNKNOWN',
        accident_datetime: new Date().toISOString(),
        ...initial,
      };
      const { data, error } = await sb.from('accidents').insert(payload).select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accident-draft'] });
      qc.invalidateQueries({ queryKey: ['accidents'] });
    },
  });
}

/** Patch a draft (autosave). */
export function useUpdateAccident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AccidentRecord> }) => {
      const { error } = await sb.from('accidents').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['accident', vars.id] });
      qc.invalidateQueries({ queryKey: ['accident-draft'] });
    },
  });
}

/** Submit the draft → SUBMITTED (case number generated by trigger). */
export function useSubmitAccident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<AccidentRecord> => {
      const { data, error } = await sb
        .from('accidents')
        .update({ status: 'SUBMITTED' })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as AccidentRecord;
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ['accident', rec.id] });
      qc.invalidateQueries({ queryKey: ['accident-draft'] });
      qc.invalidateQueries({ queryKey: ['accidents'] });
    },
  });
}

export function useCancelAccident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('accidents').update({ status: 'CANCELLED' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accident-draft'] });
      qc.invalidateQueries({ queryKey: ['accidents'] });
    },
  });
}

// ---------------- FILES ----------------

export function useUploadAccidentFile() {
  const { driverProfile } = useDriverAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accidentId,
      file,
      checklistTag,
    }: {
      accidentId: string;
      file: File;
      checklistTag?: string | null;
    }): Promise<AccidentFile> => {
      if (!driverProfile?.id) throw new Error('Not authenticated');

      const compressed = await compressImage(file).catch(() => file);
      const ft = fileTypeFromMime(compressed.type);
      const folder = ft === 'PHOTO' ? 'photos' : ft === 'VIDEO' ? 'videos' : 'docs';
      const ext = compressed.name.split('.').pop() || 'bin';
      const path = `${driverProfile.customer_id ?? 'no-tenant'}/${accidentId}/${folder}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await sb.storage.from(ACCIDENT_BUCKET).upload(path, compressed, {
        cacheControl: '3600',
        upsert: false,
        contentType: compressed.type,
      });
      if (upErr) throw upErr;

      const { data: signed } = await sb.storage.from(ACCIDENT_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
      const fileUrl = signed?.signedUrl || path;

      const { data: rec, error: insErr } = await sb
        .from('accident_files')
        .insert({
          accident_id: accidentId,
          customer_id: driverProfile.customer_id ?? null,
          file_type: ft,
          file_url: fileUrl,
          mime_type: compressed.type,
          original_filename: file.name,
          storage_path: path,
          size_bytes: compressed.size,
          checklist_tag: checklistTag ?? null,
        })
        .select('*')
        .single();
      if (insErr) throw insErr;
      return rec as AccidentFile;
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ['accident-files', rec.accident_id] });
    },
  });
}

export function useDeleteAccidentFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: AccidentFile) => {
      if (file.storage_path) {
        await sb.storage.from(ACCIDENT_BUCKET).remove([file.storage_path]);
      }
      const { error } = await sb.from('accident_files').delete().eq('id', file.id);
      if (error) throw error;
      return file.accident_id;
    },
    onSuccess: (accidentId) => {
      qc.invalidateQueries({ queryKey: ['accident-files', accidentId] });
    },
  });
}

/**
 * Admin file upload — used in the admin case workspace to attach
 * police reports, scanned documents, etc. Uses signed URLs and
 * tags the file as ADMIN-uploaded via metadata.
 */
export function useUploadAdminAccidentFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accidentId,
      file,
      checklistTag,
      customerId,
    }: {
      accidentId: string;
      file: File;
      checklistTag?: string | null;
      customerId?: string | null;
    }): Promise<AccidentFile> => {
      const compressed = await compressImage(file).catch(() => file);
      const ft = fileTypeFromMime(compressed.type);
      const folder = ft === 'PHOTO' ? 'photos' : ft === 'VIDEO' ? 'videos' : 'docs';
      const ext = compressed.name.split('.').pop() || 'bin';
      const path = `${customerId ?? 'no-tenant'}/${accidentId}/${folder}/admin-${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await sb.storage.from(ACCIDENT_BUCKET).upload(path, compressed, {
        cacheControl: '3600',
        upsert: false,
        contentType: compressed.type,
      });
      if (upErr) throw upErr;

      const { data: signed } = await sb.storage.from(ACCIDENT_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
      const fileUrl = signed?.signedUrl || path;

      const { data: rec, error: insErr } = await sb
        .from('accident_files')
        .insert({
          accident_id: accidentId,
          customer_id: customerId ?? null,
          file_type: ft,
          file_url: fileUrl,
          mime_type: compressed.type,
          original_filename: file.name,
          storage_path: path,
          size_bytes: compressed.size,
          checklist_tag: checklistTag ?? 'admin_upload',
        })
        .select('*')
        .single();
      if (insErr) throw insErr;
      return rec as AccidentFile;
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ['accident-files', rec.accident_id] });
      toast.success('Fichier ajouté');
    },
    onError: (e: any) => toast.error('Échec de l\'envoi', { description: e.message }),
  });
}

export function useUpsertAccidentParty() {
  const { driverProfile } = useDriverAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (party: Partial<AccidentParty> & { accident_id: string; party_type: PartyType }) => {
      const payload = { customer_id: driverProfile?.customer_id ?? null, ...party };
      if (party.id) {
        const { error } = await sb.from('accident_parties').update(payload).eq('id', party.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('accident_parties').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['accident-parties', vars.accident_id] });
    },
  });
}

export function useDeleteAccidentParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accidentId }: { id: string; accidentId: string }) => {
      const { error } = await sb.from('accident_parties').delete().eq('id', id);
      if (error) throw error;
      return accidentId;
    },
    onSuccess: (accidentId) => {
      qc.invalidateQueries({ queryKey: ['accident-parties', accidentId] });
    },
  });
}

// ---------------- DRIVER NOTES ----------------

export function useAddDriverComment() {
  const { driverProfile } = useDriverAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accidentId, body }: { accidentId: string; body: string }) => {
      const { error } = await sb.from('accident_notes').insert({
        accident_id: accidentId,
        customer_id: driverProfile?.customer_id ?? null,
        visibility: 'DRIVER',
        body,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['accident-timeline', vars.accidentId] });
      toast.success('Commentaire ajouté');
    },
  });
}

// ---------------- HELPERS ----------------

export function geohashEncode(lat: number, lng: number, precision = 7): string {
  try {
    return ngeohash.encode(lat, lng, precision);
  } catch {
    return '';
  }
}

/** Light reverse geocode using OSM Nominatim (free, no key). */
export async function reverseGeocode(lat: number, lng: number): Promise<{ address?: string; city?: string; region?: string }> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=fr`,
      { headers: { Accept: 'application/json' } },
    );
    if (!r.ok) return {};
    const j = await r.json();
    const a = j.address || {};
    return {
      address: j.display_name,
      city: a.city || a.town || a.village || a.suburb,
      region: a.state || a.region || a.county,
    };
  } catch {
    return {};
  }
}

// =========================================================
// ADMIN HOOKS — ServiceNow-style case management
// =========================================================

export interface AdminAccidentRow extends AccidentRecord {
  driver?: { id: string; full_name: string; phone_number: string | null; profile_image_url: string | null } | null;
  vehicle?: { id: string; license_plate: string | null; model_name: string | null } | null;
  assigned_admin?: { id: string; full_name: string | null; email: string } | null;
}

export interface AdminAccidentFilters {
  status?: AccidentStatus | 'ALL';
  severity?: AccidentSeverity | 'ALL';
  city?: string;
  search?: string;
  assignedAdminId?: string | 'ALL' | 'UNASSIGNED';
  fromDate?: string;
  toDate?: string;
}

export function useAdminAccidents(filters: AdminAccidentFilters = {}) {
  return useQuery({
    queryKey: ['admin-accidents', filters],
    queryFn: async (): Promise<AdminAccidentRow[]> => {
      let q = sb
        .from('accidents')
        .select(
          'id, case_number, customer_id, driver_id, vehicle_id, rental_id, status, severity, accident_datetime, description, police_involved, injury_involved, other_party_involved, location_lat, location_lng, location_address, location_geohash, city, region, assigned_admin_id, created_at, updated_at, submitted_at, closed_at, driver:drivers(id, full_name, phone_number, profile_image_url), vehicle:vehicles(id, license_plate, model_name), assigned_admin:admin_users!accidents_assigned_admin_id_fkey(id, full_name, email)'
        )
        .neq('status', 'DRAFT')
        .order('created_at', { ascending: false })
        .limit(500);

      if (filters.status && filters.status !== 'ALL') q = q.eq('status', filters.status);
      if (filters.severity && filters.severity !== 'ALL') q = q.eq('severity', filters.severity);
      if (filters.city) q = q.ilike('city', `%${filters.city}%`);
      if (filters.fromDate) q = q.gte('accident_datetime', filters.fromDate);
      if (filters.toDate) q = q.lte('accident_datetime', filters.toDate);
      if (filters.assignedAdminId === 'UNASSIGNED') q = q.is('assigned_admin_id', null);
      else if (filters.assignedAdminId && filters.assignedAdminId !== 'ALL')
        q = q.eq('assigned_admin_id', filters.assignedAdminId);
      if (filters.search) q = q.or(`case_number.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data as AdminAccidentRow[]) || [];
    },
  });
}

export function useAdminAccidentKPIs() {
  return useQuery({
    queryKey: ['admin-accident-kpis'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('accidents')
        .select('status, severity, submitted_at, closed_at, assigned_admin_id')
        .neq('status', 'DRAFT')
        .limit(2000);
      if (error) throw error;
      const rows = (data as any[]) || [];
      const open = rows.filter((r) => !['CLOSED', 'CANCELLED'].includes(r.status)).length;
      const unassigned = rows.filter((r) => !r.assigned_admin_id && !['CLOSED', 'CANCELLED'].includes(r.status)).length;
      const severe = rows.filter((r) => r.severity === 'SEVERE' && !['CLOSED', 'CANCELLED'].includes(r.status)).length;
      const last30 = rows.filter((r) => r.submitted_at && new Date(r.submitted_at) > new Date(Date.now() - 30 * 86400000)).length;
      return { total: rows.length, open, unassigned, severe, last30 };
    },
  });
}

export function useAdminAccident(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-accident', id],
    enabled: !!id,
    queryFn: async (): Promise<AdminAccidentRow> => {
      const { data, error } = await sb
        .from('accidents')
        .select(
          'id, case_number, customer_id, driver_id, vehicle_id, rental_id, status, severity, accident_datetime, description, police_involved, injury_involved, other_party_involved, location_lat, location_lng, location_address, location_geohash, city, region, assigned_admin_id, created_at, updated_at, submitted_at, closed_at, driver:drivers(id, full_name, phone_number, profile_image_url), vehicle:vehicles(id, license_plate, model_name), assigned_admin:admin_users!accidents_assigned_admin_id_fkey(id, full_name, email)'
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as AdminAccidentRow;
    },
  });
}

export function useTransitionAccidentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: AccidentStatus; reason?: string }) => {
      if (status === 'RESOLVED_AT_FAULT' || status === 'RESOLVED_NOT_AT_FAULT') {
        throw new Error('Utilisez la décision de responsabilité pour appliquer un sinistre au score.');
      }
      const { error } = await sb.from('accidents').update({ status }).eq('id', id);
      if (error) throw error;
      if (reason) {
        await sb.from('accident_notes').insert({ accident_id: id, visibility: 'INTERNAL', body: `[${status}] ${reason}` });
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-accident', vars.id] });
      qc.invalidateQueries({ queryKey: ['admin-accidents'] });
      qc.invalidateQueries({ queryKey: ['accident-timeline', vars.id] });
      qc.invalidateQueries({ queryKey: ['admin-accident-kpis'] });
      toast.success('Statut mis à jour');
    },
    onError: (e: any) => toast.error('Échec de la transition', { description: e.message }),
  });
}

export function useAssignAccident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, adminId }: { id: string; adminId: string | null }) => {
      const { error } = await sb.from('accidents').update({ assigned_admin_id: adminId }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-accident', vars.id] });
      qc.invalidateQueries({ queryKey: ['admin-accidents'] });
      toast.success('Assignation mise à jour');
    },
  });
}

export function useAddAdminNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accidentId, body, visibility }: { accidentId: string; body: string; visibility: 'INTERNAL' | 'DRIVER' }) => {
      const { error } = await sb.from('accident_notes').insert({ accident_id: accidentId, body, visibility });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['accident-timeline', vars.accidentId] });
      toast.success('Note ajoutée');
    },
  });
}

export interface DeterminationPayload {
  accident_id: string;
  at_fault: boolean;
  fault_basis?: string;
  final_summary?: string;
  score_impact: boolean;
  score_delta: number;
  financial_impact_estimate?: number | null;
  insurance_action_required?: boolean;
  police_report_result?: string | null;
}

export function useAccidentDetermination(accidentId: string | undefined) {
  return useQuery({
    queryKey: ['accident-determination', accidentId],
    enabled: !!accidentId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('accident_determinations')
        .select('*')
        .eq('accident_id', accidentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useResolveAccident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: DeterminationPayload) => {
      const { data: acc, error: accErr } = await sb
        .from('accidents')
        .select('driver_id, customer_id, status')
        .eq('id', p.accident_id)
        .single();
      if (accErr) throw accErr;

      const { data: previousDetermination, error: prevErr } = await sb
        .from('accident_determinations')
        .select('id, at_fault, score_impact, score_delta')
        .eq('accident_id', p.accident_id)
        .maybeSingle();
      if (prevErr) throw prevErr;

      // Upsert determination
      const { error: detErr } = await sb.from('accident_determinations').upsert(
        {
          accident_id: p.accident_id,
          customer_id: acc.customer_id,
          at_fault: p.at_fault,
          fault_basis: p.fault_basis ?? null,
          final_summary: p.final_summary ?? null,
          score_impact: p.score_impact,
          score_delta: p.score_delta,
          financial_impact_estimate: p.financial_impact_estimate ?? null,
          insurance_action_required: p.insurance_action_required ?? false,
          police_report_result: p.police_report_result ?? null,
          determination_status: p.at_fault ? 'AT_FAULT' : 'NOT_AT_FAULT',
          determined_at: new Date().toISOString(),
        },
        { onConflict: 'accident_id' },
      );
      if (detErr) throw detErr;

      const previousAppliedDelta = previousDetermination?.at_fault && previousDetermination?.score_impact
        ? Number(previousDetermination.score_delta || 0)
        : 0;
      const nextAppliedDelta = p.at_fault && p.score_impact ? Number(p.score_delta || 0) : 0;
      const adjustmentDelta = nextAppliedDelta - previousAppliedDelta;

      if (adjustmentDelta !== 0) {
        const { error: eventErr } = await sb.from('driver_score_events').insert({
          driver_id: acc.driver_id,
          customer_id: acc.customer_id,
          accident_id: p.accident_id,
          delta: adjustmentDelta,
          reason: p.at_fault ? 'Sinistre responsable' : 'Annulation pénalité sinistre',
        });
        if (eventErr) throw eventErr;
      }

      // Transition status
      const newStatus: AccidentStatus = p.at_fault ? 'RESOLVED_AT_FAULT' : 'RESOLVED_NOT_AT_FAULT';
      const { error: stErr } = await sb.from('accidents').update({ status: newStatus }).eq('id', p.accident_id);
      if (stErr) throw stErr;

      if (p.final_summary?.trim()) {
        await sb.from('accident_notes').insert({
          accident_id: p.accident_id,
          visibility: 'INTERNAL',
          body: `[${newStatus}] ${p.final_summary.trim()}`,
        });
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-accident', vars.accident_id] });
      qc.invalidateQueries({ queryKey: ['admin-accidents'] });
      qc.invalidateQueries({ queryKey: ['accident-determination', vars.accident_id] });
      qc.invalidateQueries({ queryKey: ['accident-timeline', vars.accident_id] });
      qc.invalidateQueries({ queryKey: ['admin-accident-kpis'] });
      qc.invalidateQueries({ queryKey: ['driverCreditScores'] });
      toast.success('Détermination enregistrée');
    },
    onError: (e: any) => toast.error('Échec', { description: e.message }),
  });
}

// ---------------- INVESTIGATION ----------------

export interface AccidentInvestigation {
  id?: string;
  accident_id: string;
  incident_category?: string | null;
  collision_type?: string | null;
  weather_conditions?: string | null;
  road_conditions?: string | null;
  root_cause?: string | null;
  corrective_action?: string | null;
  internal_findings?: string | null;
}

export function useAccidentInvestigation(accidentId: string | undefined) {
  return useQuery({
    queryKey: ['accident-investigation', accidentId],
    enabled: !!accidentId,
    queryFn: async (): Promise<AccidentInvestigation | null> => {
      const { data, error } = await sb
        .from('accident_investigations')
        .select('*')
        .eq('accident_id', accidentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertInvestigation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AccidentInvestigation & { customer_id?: string | null }) => {
      const { error } = await sb.from('accident_investigations').upsert(payload, { onConflict: 'accident_id' });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['accident-investigation', vars.accident_id] });
      qc.invalidateQueries({ queryKey: ['accident-timeline', vars.accident_id] });
      toast.success('Enquête sauvegardée');
    },
    onError: (e: any) => toast.error('Échec de la sauvegarde', { description: e.message }),
  });
}

// ---------------- REQUEST MORE INFO ----------------

/**
 * One-click admin action: posts a DRIVER-visible note + transitions case to WAITING_DOCS.
 */
export function useRequestMoreInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accidentId, message, currentStatus }: { accidentId: string; message: string; currentStatus: AccidentStatus }) => {
      // 1. Post DRIVER-visible note
      const { error: noteErr } = await sb.from('accident_notes').insert({
        accident_id: accidentId,
        visibility: 'DRIVER',
        body: `📎 Documents requis: ${message}`,
      });
      if (noteErr) throw noteErr;

      // 2. Transition status to WAITING_DOCS if currently UNDER_REVIEW
      if (currentStatus === 'UNDER_REVIEW') {
        const { error: stErr } = await sb.from('accidents').update({ status: 'WAITING_DOCS' }).eq('id', accidentId);
        if (stErr) throw stErr;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-accident', vars.accidentId] });
      qc.invalidateQueries({ queryKey: ['admin-accidents'] });
      qc.invalidateQueries({ queryKey: ['accident-timeline', vars.accidentId] });
      toast.success('Demande envoyée au conducteur');
    },
    onError: (e: any) => toast.error('Échec', { description: e.message }),
  });
}

// ---------------- CLOSE CASE ----------------

export function useCloseAccidentCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accidentId, resolutionSummary }: { accidentId: string; resolutionSummary: string }) => {
      // Post internal note for audit trail
      await sb.from('accident_notes').insert({
        accident_id: accidentId,
        visibility: 'INTERNAL',
        body: `[CLOSURE] ${resolutionSummary}`,
      });
      // Transition to CLOSED
      const { error } = await sb.from('accidents').update({ status: 'CLOSED' }).eq('id', accidentId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-accident', vars.accidentId] });
      qc.invalidateQueries({ queryKey: ['admin-accidents'] });
      qc.invalidateQueries({ queryKey: ['accident-timeline', vars.accidentId] });
      qc.invalidateQueries({ queryKey: ['admin-accident-kpis'] });
      toast.success('Dossier clôturé');
    },
    onError: (e: any) => toast.error('Échec de la clôture', { description: e.message }),
  });
}

export function useAdminUsersList() {
  return useQuery({
    queryKey: ['admin-users-list-min'],
    queryFn: async () => {
      const { data, error } = await sb.from('admin_users').select('id, full_name, email').eq('is_active', true).order('full_name');
      if (error) throw error;
      return (data as { id: string; full_name: string | null; email: string }[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Allowed transitions matching the DB trigger. */
export function allowedTransitions(status: AccidentStatus): AccidentStatus[] {
  switch (status) {
    case 'SUBMITTED': return ['UNDER_REVIEW', 'CANCELLED'];
    case 'UNDER_REVIEW': return ['WAITING_DOCS', 'INVESTIGATING', 'CANCELLED'];
    case 'WAITING_DOCS': return ['UNDER_REVIEW', 'CANCELLED'];
    case 'INVESTIGATING': return ['PENDING_DETERMINATION', 'CANCELLED'];
    // RESOLVED_AT_FAULT / RESOLVED_NOT_AT_FAULT are intentionally NOT exposed here.
    // They must be set via the Détermination dialog (useResolveAccident) so that an
    // accident_determinations row is created and the score event is applied.
    case 'PENDING_DETERMINATION': return ['CANCELLED'];
    case 'RESOLVED_NOT_AT_FAULT':
    case 'RESOLVED_AT_FAULT':
      return ['CLOSED', 'CANCELLED'];
    default: return [];
  }
}
