import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import {
  Search,
  Download,
  Copy,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  Link2,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useVehicles } from '@/hooks/useAdminData';
import { useCreateVehicle } from '@/hooks/useAdminData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useUffizioLiveData, type UffizioVehicle } from '@/hooks/useUffizioLiveData';
import { supabase } from '@/integrations/supabase/routeClient';

type MatchSource = 'plate' | 'manual' | 'fuzzy' | null;
type RowKind = 'matched' | 'auto-detected' | 'unmatched-vehicle' | 'unmatched-device';
type FilterKind = 'all' | 'matched' | 'auto-detected' | 'unmatched-vehicle' | 'unmatched-device';

interface MappingRow {
  key: string;
  vehicleId: string | null;
  model: string;
  vehicleType: string;
  licensePlate: string;
  imei: string;
  deviceName: string;
  uffizioVehicleNo: string;
  lastSync: string;
  source: MatchSource;
  kind: RowKind;
  matchScore?: number; // 0-1 confidence for fuzzy matches
}

// ---------- Plate normalization & similarity ----------

const normalize = (s: string) =>
  (s || '')
    .replace(/[\s\-_/.]+/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();

/**
 * Split a plate into a structural signature: leading letters, digits, trailing letters.
 * West African plates commonly look like "AB 1234 CD" or "1234 AB 01".
 */
const plateSignature = (plate: string): { letters: string; digits: string } => {
  const n = normalize(plate);
  const letters = n.replace(/[0-9]/g, '');
  const digits = n.replace(/[^0-9]/g, '');
  return { letters, digits };
};

const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
};

/**
 * Similarity in [0,1] between two normalized plates, weighted by structural pieces.
 * - Digit block match is the strongest signal (vehicle plates' digits are stable).
 * - Letter block match is secondary.
 * - Final score = 0.7 * digit_sim + 0.3 * letter_sim.
 */
const plateSimilarity = (a: string, b: string): number => {
  const sa = plateSignature(a);
  const sb = plateSignature(b);
  if (!sa.digits && !sb.digits && !sa.letters && !sb.letters) return 0;

  const sim = (x: string, y: string): number => {
    if (!x && !y) return 1;
    if (!x || !y) return 0;
    const dist = levenshtein(x, y);
    const maxLen = Math.max(x.length, y.length);
    return 1 - dist / maxLen;
  };

  const digitSim = sim(sa.digits, sb.digits);
  const letterSim = sim(sa.letters, sb.letters);
  return 0.7 * digitSim + 0.3 * letterSim;
};

const FUZZY_THRESHOLD = 0.85; // require strong confidence to auto-suggest

const formatLastUpdate = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return "À l'instant";
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return `${Math.floor(diff / 86400)} j`;
  } catch {
    return dateStr;
  }
};

const csvEscape = (v: string | number | null | undefined) => {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export default function AdminGpsMapping() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKind>('all');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [linkingDevice, setLinkingDevice] = useState<MappingRow | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [pendingLink, setPendingLink] = useState<{
    vehicleId: string;
    vehicleLabel: string;
    plate: string;
    existingImei: string;
  } | null>(null);
  const [creatingFromDevice, setCreatingFromDevice] = useState<MappingRow | null>(null);
  const [newVehicle, setNewVehicle] = useState({
    model_name: '',
    license_plate: '',
    vehicle_type: 'car',
    rent_per_day: 8000,
  });
  const createVehicle = useCreateVehicle();

  const queryClient = useQueryClient();
  const { data: vehicles, isLoading } = useVehicles();
  const {
    vehicles: gpsVehicles,
    loading: gpsLoading,
    lastRefresh,
    refresh: refreshGPS,
  } = useUffizioLiveData({ autoRefresh: true, refreshInterval: 180000 });

  // Exact lookup map by normalized plate
  const gpsByPlate = useMemo(() => {
    const m = new Map<string, UffizioVehicle>();
    gpsVehicles.forEach((g) => {
      if (g.vehicle_no) m.set(normalize(g.vehicle_no), g);
    });
    return m;
  }, [gpsVehicles]);

  const findMatch = (
    licensePlate: string,
    uffizioDeviceId?: string | null,
  ): { gps: UffizioVehicle | null; source: MatchSource; score?: number } => {
    // 1. Manual override wins (it's the user's explicit decision)
    if (uffizioDeviceId) {
      const found = gpsVehicles.find(
        (g) =>
          g.imei_no === uffizioDeviceId ||
          g.device_name === uffizioDeviceId ||
          g.vehicle_no === uffizioDeviceId,
      );
      if (found) return { gps: found, source: 'manual', score: 1 };
    }

    // 2. Exact normalized plate match
    const norm = normalize(licensePlate);
    if (norm) {
      const exact = gpsByPlate.get(norm);
      if (exact) return { gps: exact, source: 'plate', score: 1 };
    }

    // 3. Fuzzy match: pick the BEST candidate over the threshold.
    if (norm.length >= 4) {
      let best: { gps: UffizioVehicle; score: number } | null = null;
      for (const g of gpsVehicles) {
        const gn = normalize(g.vehicle_no || '');
        if (!gn || Math.abs(gn.length - norm.length) > 3) continue;
        const score = plateSimilarity(norm, gn);
        if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
          best = { gps: g, score };
        }
      }
      if (best) return { gps: best.gps, source: 'fuzzy', score: best.score };
    }

    return { gps: null, source: null };
  };

  const rows = useMemo<MappingRow[]>(() => {
    const list: MappingRow[] = [];
    const matchedGpsIds = new Set<string>();

    (vehicles || []).forEach((v) => {
      const { gps, source, score } = findMatch(v.license_plate, v.uffizio_device_id);
      if (gps) matchedGpsIds.add(gps.id || gps.imei_no);

      let kind: RowKind = 'unmatched-vehicle';
      if (gps && (source === 'manual' || source === 'plate')) kind = 'matched';
      else if (gps && source === 'fuzzy') kind = 'auto-detected';

      list.push({
        key: `v-${v.id}`,
        vehicleId: v.id,
        model: v.model_name,
        vehicleType: v.vehicle_type,
        licensePlate: v.license_plate,
        imei: gps?.imei_no || '',
        deviceName: gps?.device_name || '',
        uffizioVehicleNo: gps?.vehicle_no || '',
        lastSync: gps?.last_update || '',
        source,
        kind,
        matchScore: score,
      });
    });

    gpsVehicles.forEach((g) => {
      const id = g.id || g.imei_no;
      if (!matchedGpsIds.has(id)) {
        list.push({
          key: `g-${id}`,
          vehicleId: null,
          model: g.device_name || '—',
          vehicleType: '—',
          licensePlate: g.vehicle_no || '—',
          imei: g.imei_no,
          deviceName: g.device_name,
          uffizioVehicleNo: g.vehicle_no,
          lastSync: g.last_update || '',
          source: null,
          kind: 'unmatched-device',
        });
      }
    });

    return list;
  }, [vehicles, gpsVehicles, gpsByPlate]);

  const counts = useMemo(() => {
    const c = { matched: 0, autoDetected: 0, unmatchedVehicle: 0, unmatchedDevice: 0 };
    rows.forEach((r) => {
      if (r.kind === 'matched') c.matched++;
      else if (r.kind === 'auto-detected') c.autoDetected++;
      else if (r.kind === 'unmatched-vehicle') c.unmatchedVehicle++;
      else if (r.kind === 'unmatched-device') c.unmatchedDevice++;
    });
    return c;
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== 'all') {
        if (filter === 'matched' && r.kind !== 'matched') return false;
        if (filter === 'auto-detected' && r.kind !== 'auto-detected') return false;
        if (filter === 'unmatched-vehicle' && r.kind !== 'unmatched-vehicle') return false;
        if (filter === 'unmatched-device' && r.kind !== 'unmatched-device') return false;
      }
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.model.toLowerCase().includes(q) ||
        r.licensePlate.toLowerCase().includes(q) ||
        r.imei.toLowerCase().includes(q) ||
        r.deviceName.toLowerCase().includes(q) ||
        r.uffizioVehicleNo.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

  // Vehicles available for orphan-link assignment (exclude those already manually assigned to another device)
  const linkCandidates = useMemo(() => {
    if (!linkingDevice) return [];
    const q = linkSearch.trim().toLowerCase();
    return (vehicles || [])
      .filter((v) => {
        if (q) {
          const hay = `${v.model_name} ${v.license_plate} ${v.vehicle_type}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((v) => {
        const conflict =
          v.uffizio_device_id && v.uffizio_device_id !== linkingDevice.imei
            ? v.uffizio_device_id
            : null;
        return { vehicle: v, conflict };
      })
      .slice(0, 50);
  }, [vehicles, linkingDevice, linkSearch]);

  const copy = async (value: string, label = 'IMEI') => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copié`);
    } catch {
      toast.error('Impossible de copier');
    }
  };

  // ---------- Actions ----------

  const confirmAutoMatch = async (row: MappingRow) => {
    if (!row.vehicleId || !row.imei) return;
    setErrorId(null);
    setConfirmingId(row.key);
    try {
      const { error } = await supabase
        .from('vehicles')
        .update({ uffizio_device_id: row.imei })
        .eq('id', row.vehicleId);
      if (error) throw error;
      toast.success(`Lien confirmé : ${row.licensePlate} ↔ ${row.imei}`);
      setConfirmedId(row.key);
      // Clear the success flash after 2.5s (the row will also disappear from "auto-detected" filter on refetch)
      setTimeout(() => {
        setConfirmedId((curr) => (curr === row.key ? null : curr));
      }, 2500);
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
    } catch (err: any) {
      const msg = err?.message || 'Erreur lors de la confirmation';
      toast.error(msg);
      setErrorId(row.key);
      setTimeout(() => {
        setErrorId((curr) => (curr === row.key ? null : curr));
      }, 4000);
    } finally {
      setConfirmingId(null);
    }
  };

  const performLink = async (vehicleId: string) => {
    if (!linkingDevice) return;
    setLinkSubmitting(true);
    try {
      const { error } = await supabase
        .from('vehicles')
        .update({ uffizio_device_id: linkingDevice.imei })
        .eq('id', vehicleId);
      if (error) throw error;
      toast.success(`Module ${linkingDevice.imei} associé`);
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
      setLinkingDevice(null);
      setLinkSearch('');
      setPendingLink(null);
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de l\'association');
    } finally {
      setLinkSubmitting(false);
    }
  };

  const requestLink = (vehicleId: string, vehicleLabel: string, plate: string, conflict: string | null) => {
    if (conflict) {
      setPendingLink({ vehicleId, vehicleLabel, plate, existingImei: conflict });
      return;
    }
    performLink(vehicleId);
  };

  const openCreateFromDevice = (row: MappingRow) => {
    setCreatingFromDevice(row);
    setNewVehicle({
      model_name: row.deviceName || row.uffizioVehicleNo || 'Véhicule GPS',
      license_plate: row.uffizioVehicleNo || '',
      vehicle_type: 'car',
      rent_per_day: 8000,
    });
  };

  const submitCreateFromDevice = async () => {
    if (!creatingFromDevice) return;
    if (!newVehicle.model_name.trim() || !newVehicle.license_plate.trim()) {
      toast.error('Modèle et immatriculation requis');
      return;
    }
    try {
      await createVehicle.mutateAsync({
        model_name: newVehicle.model_name.trim(),
        license_plate: newVehicle.license_plate.trim(),
        vehicle_type: newVehicle.vehicle_type,
        rent_per_day: Number(newVehicle.rent_per_day) || 0,
        uffizio_device_id: creatingFromDevice.imei,
        status: 'available',
      });
      setCreatingFromDevice(null);
    } catch {
      /* toast handled in hook */
    }
  };

  // ---------- CSV export ----------

  const buildCsv = (source: MappingRow[], scope: 'visible' | 'all') => {
    const header = [
      'Type',
      'Modèle',
      'Catégorie',
      'Immatriculation',
      'IMEI Uffizio',
      'Nom du device',
      'N° véhicule Uffizio',
      'Dernière synchro',
      'Source du lien',
      'Score de confiance',
      'Statut',
    ];
    const lines = [header.map(csvEscape).join(',')];
    source.forEach((r) => {
      const status =
        r.kind === 'matched'
          ? 'Associé'
          : r.kind === 'auto-detected'
          ? 'Auto-détecté (à confirmer)'
          : r.kind === 'unmatched-vehicle'
          ? 'Sans GPS'
          : 'Device sans véhicule';
      const sourceLabel =
        r.source === 'plate'
          ? 'Immatriculation'
          : r.source === 'manual'
          ? 'Manuel'
          : r.source === 'fuzzy'
          ? 'Approximatif'
          : '';
      lines.push(
        [
          r.vehicleId ? 'Véhicule' : 'Device GPS',
          r.model,
          r.vehicleType,
          r.licensePlate,
          r.imei,
          r.deviceName,
          r.uffizioVehicleNo,
          r.lastSync,
          sourceLabel,
          r.matchScore != null ? `${Math.round(r.matchScore * 100)}%` : '',
          status,
        ]
          .map(csvEscape)
          .join(','),
      );
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const tag = scope === 'visible' ? 'filtre' : 'complet';
    a.download = `mapping-gps-${tag}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportVisible = () => {
    buildCsv(filteredRows, 'visible');
    toast.success(`Export : ${filteredRows.length} ligne(s) visibles`);
  };

  const exportAll = () => {
    buildCsv(rows, 'all');
    toast.success(`Export complet : ${rows.length} ligne(s)`);
  };

  const exportPlatesOnly = () => {
    const header = ['Marque / Modèle', 'Immatriculation', 'IMEI Uffizio'];
    const lines = [header.map(csvEscape).join(',')];
    filteredRows.forEach((r) => {
      lines.push([r.model, r.licensePlate, r.imei].map(csvEscape).join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapping-gps-simple-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Export simplifié : ${filteredRows.length} ligne(s)`);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Véhicules', href: '/admin/vehicles' }, { label: 'Mapping GPS' }]} />
        <ListPageSkeleton columns={6} rows={8} />
      </AdminLayout>
    );
  }

  const StatBadge = ({
    label,
    value,
    color,
    active,
    onClick,
  }: {
    label: string;
    value: number;
    color: string;
    active: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 min-w-[140px] rounded-lg border px-3 py-2.5 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </button>
  );

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Véhicules', href: '/admin/vehicles' }, { label: 'Mapping GPS' }]} />
      <AdminPageHeader
        title="Mapping GPS"
        description="Correspondance entre les véhicules de la flotte et les modules Uffizio. Source unique de vérité — pas besoin de fichier Excel."
        action={
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Synchro : {lastRefresh.toLocaleTimeString('fr-FR')}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={refreshGPS} disabled={gpsLoading}>
              {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Exporter
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Format CSV</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportVisible}>
                  <span className="flex flex-col">
                    <span>Filtre actuel ({filteredRows.length})</span>
                    <span className="text-xs text-muted-foreground">Détails complets, lignes visibles</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportAll}>
                  <span className="flex flex-col">
                    <span>Tout ({rows.length})</span>
                    <span className="text-xs text-muted-foreground">Détails complets, sans filtre</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportPlatesOnly}>
                  <span className="flex flex-col">
                    <span>Modèle + Immat. + IMEI</span>
                    <span className="text-xs text-muted-foreground">Format simplifié (filtre actuel)</span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/vehicles">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Véhicules
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <StatBadge label="Tous" value={rows.length} color="bg-foreground/40" active={filter === 'all'} onClick={() => setFilter('all')} />
        <StatBadge label="Associés" value={counts.matched} color="bg-emerald-500" active={filter === 'matched'} onClick={() => setFilter('matched')} />
        <StatBadge label="Auto-détectés (à confirmer)" value={counts.autoDetected} color="bg-blue-500" active={filter === 'auto-detected'} onClick={() => setFilter('auto-detected')} />
        <StatBadge label="Véhicules sans GPS" value={counts.unmatchedVehicle} color="bg-red-500" active={filter === 'unmatched-vehicle'} onClick={() => setFilter('unmatched-vehicle')} />
        <StatBadge label="Devices sans véhicule" value={counts.unmatchedDevice} color="bg-amber-500" active={filter === 'unmatched-device'} onClick={() => setFilter('unmatched-device')} />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher modèle, immatriculation, IMEI, nom device…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Statut</TableHead>
                <TableHead>Modèle</TableHead>
                <TableHead>Immatriculation</TableHead>
                <TableHead>IMEI Uffizio</TableHead>
                <TableHead>Nom du device</TableHead>
                <TableHead>Dernière synchro</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-32">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Aucune correspondance pour ces critères.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>
                      {r.kind === 'matched' && (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Associé
                        </Badge>
                      )}
                      {r.kind === 'auto-detected' && (
                        <Badge variant="outline" className="border-blue-500/40 text-blue-600">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Auto-détecté
                        </Badge>
                      )}
                      {r.kind === 'unmatched-vehicle' && (
                        <Badge variant="outline" className="border-red-500/40 text-red-600">
                          <XCircle className="h-3 w-3 mr-1" /> Sans GPS
                        </Badge>
                      )}
                      {r.kind === 'unmatched-device' && (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Device orphelin
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{r.model}</TableCell>
                    <TableCell className="font-mono text-sm">{r.licensePlate}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.imei ? (
                        <div className="flex items-center gap-1.5">
                          <span>{r.imei}</span>
                          <button
                            type="button"
                            onClick={() => copy(r.imei, 'IMEI')}
                            className="inline-flex items-center justify-center rounded p-0.5 hover:bg-accent hover:text-accent-foreground transition-colors"
                            title="Copier l'IMEI"
                            aria-label="Copier l'IMEI"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.deviceName || <span className="text-muted-foreground">—</span>}
                      {r.uffizioVehicleNo && r.uffizioVehicleNo !== r.licensePlate && (
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Uffizio: {r.uffizioVehicleNo}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.lastSync ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs cursor-help">{formatLastUpdate(r.lastSync)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{r.lastSync}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.source === 'plate' && (
                        <span className="text-xs text-emerald-600">Immatriculation</span>
                      )}
                      {r.source === 'manual' && <span className="text-xs text-amber-600">Manuel</span>}
                      {r.source === 'fuzzy' && (
                        <span className="text-xs text-blue-600">
                          Approx. {r.matchScore != null ? `(${Math.round(r.matchScore * 100)}%)` : ''}
                        </span>
                      )}
                      {!r.source && <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.kind === 'auto-detected' && r.vehicleId && r.imei && (
                        <Button
                          size="sm"
                          variant={
                            confirmedId === r.key
                              ? 'outline'
                              : errorId === r.key
                              ? 'destructive'
                              : 'default'
                          }
                          className={cn(
                            'h-7 text-xs transition-colors',
                            confirmedId === r.key &&
                              'border-emerald-500/60 text-emerald-700 bg-emerald-50 hover:bg-emerald-50',
                          )}
                          onClick={() => confirmAutoMatch(r)}
                          disabled={confirmingId === r.key || confirmedId === r.key}
                        >
                          {confirmingId === r.key ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              Enregistrement…
                            </>
                          ) : confirmedId === r.key ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Confirmé
                            </>
                          ) : errorId === r.key ? (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Réessayer
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Confirmer
                            </>
                          )}
                        </Button>
                      )}
                      {r.kind === 'unmatched-device' && (
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={() => {
                              setLinkingDevice(r);
                              setLinkSearch('');
                            }}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            Associer
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openCreateFromDevice(r)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Créer véhicule
                          </Button>
                        </div>
                      )}
                      {r.kind === 'matched' && r.vehicleId && (
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link to="/admin/vehicles">Modifier</Link>
                        </Button>
                      )}
                      {r.kind === 'unmatched-vehicle' && r.vehicleId && (
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link to="/admin/vehicles">Assigner</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-4 border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-3">
          <div className="flex items-start gap-3 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mt-1" />
            <div className="text-muted-foreground space-y-1">
              <p>
                Source unique de vérité : la liste des modules Uffizio est récupérée toutes les 30 min via l'API.
                Plus besoin de tenir un fichier Excel à jour.
              </p>
              <p>
                <strong>Auto-détecté</strong> = correspondance approximative trouvée par similarité d'immatriculation
                (seuil {Math.round(FUZZY_THRESHOLD * 100)}%, pondération chiffres/lettres). Cliquez sur
                <strong> Confirmer </strong>pour figer le lien dans la fiche véhicule.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Link orphan device dialog */}
      <Dialog open={!!linkingDevice} onOpenChange={(open) => !open && setLinkingDevice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Associer le module à un véhicule</DialogTitle>
            <DialogDescription>
              {linkingDevice && (
                <span className="block space-y-0.5">
                  <span className="block">
                    Module GPS : <span className="font-mono">{linkingDevice.imei}</span>
                  </span>
                  {linkingDevice.deviceName && (
                    <span className="block text-xs">Nom : {linkingDevice.deviceName}</span>
                  )}
                  {linkingDevice.uffizioVehicleNo && (
                    <span className="block text-xs">Plaque Uffizio : {linkingDevice.uffizioVehicleNo}</span>
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un véhicule par modèle, immatriculation…"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
              {linkCandidates.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Aucun véhicule trouvé.
                </div>
              ) : (
                linkCandidates.map(({ vehicle, conflict }) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    disabled={linkSubmitting}
                    onClick={() =>
                      requestLink(
                        vehicle.id,
                        vehicle.model_name,
                        vehicle.license_plate,
                        conflict,
                      )
                    }
                    className="w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between gap-2 disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{vehicle.model_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {vehicle.license_plate} · {vehicle.vehicle_type}
                      </div>
                      {conflict && (
                        <div className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Déjà lié à : <span className="font-mono">{conflict}</span>
                        </div>
                      )}
                    </div>
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkingDevice(null)} disabled={linkSubmitting}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict confirmation dialog */}
      <AlertDialog
        open={!!pendingLink}
        onOpenChange={(open) => {
          if (!open && !linkSubmitting) setPendingLink(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Ce véhicule a déjà un module GPS
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {pendingLink && linkingDevice ? (
                <div className="space-y-3 text-sm">
                  <p>
                    Le véhicule <strong>{pendingLink.vehicleLabel}</strong>{' '}
                    (<span className="font-mono">{pendingLink.plate}</span>) est actuellement lié au module :
                  </p>
                  <div className="rounded-md border bg-muted/50 p-2 font-mono text-xs">
                    {pendingLink.existingImei}
                  </div>
                  <p>Voulez-vous le remplacer par le nouveau module ?</p>
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-50 p-2 font-mono text-xs text-emerald-800">
                    {linkingDevice.imei}
                    {linkingDevice.deviceName && (
                      <span className="block text-[11px] opacity-70 font-sans mt-0.5">
                        {linkingDevice.deviceName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    L'ancien module deviendra orphelin et pourra être ré-associé à un autre véhicule.
                  </p>
                </div>
              ) : (
                <span />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={linkSubmitting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={linkSubmitting}
              onClick={(e) => {
                e.preventDefault();
                if (pendingLink) performLink(pendingLink.vehicleId);
              }}
              className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600"
            >
              {linkSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Remplacement…
                </>
              ) : (
                'Remplacer'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create vehicle from orphan device dialog */}
      <Dialog
        open={!!creatingFromDevice}
        onOpenChange={(open) => !open && !createVehicle.isPending && setCreatingFromDevice(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer un véhicule depuis le module</DialogTitle>
            <DialogDescription>
              {creatingFromDevice && (
                <span className="block text-xs">
                  Module GPS : <span className="font-mono">{creatingFromDevice.imei}</span>
                  {creatingFromDevice.deviceName && <> · {creatingFromDevice.deviceName}</>}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nv-model">Marque / Modèle</Label>
              <Input
                id="nv-model"
                value={newVehicle.model_name}
                onChange={(e) => setNewVehicle((s) => ({ ...s, model_name: e.target.value }))}
                placeholder="Toyota Corolla"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nv-plate">Immatriculation</Label>
              <Input
                id="nv-plate"
                value={newVehicle.license_plate}
                onChange={(e) => setNewVehicle((s) => ({ ...s, license_plate: e.target.value }))}
                placeholder="AB-1234-CD"
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={newVehicle.vehicle_type}
                  onValueChange={(v) => setNewVehicle((s) => ({ ...s, vehicle_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="car">Voiture</SelectItem>
                    <SelectItem value="sedan">Berline</SelectItem>
                    <SelectItem value="compact">Compacte</SelectItem>
                    <SelectItem value="bike">Moto</SelectItem>
                    <SelectItem value="cargo">Cargo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nv-rent">Location / jour (FCFA)</Label>
                <Input
                  id="nv-rent"
                  type="number"
                  min={0}
                  value={newVehicle.rent_per_day}
                  onChange={(e) =>
                    setNewVehicle((s) => ({ ...s, rent_per_day: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreatingFromDevice(null)}
              disabled={createVehicle.isPending}
            >
              Annuler
            </Button>
            <Button onClick={submitCreateFromDevice} disabled={createVehicle.isPending}>
              {createVehicle.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Création…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Créer & associer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
