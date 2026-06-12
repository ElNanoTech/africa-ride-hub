import { useState, useRef, useMemo, useEffect } from 'react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { FleetGPSOverview } from '@/components/FleetGPSOverview';
import { ADMIN, VEHICLE, UI } from '@/lib/i18n';
import { formatCurrency } from '@/lib/format';
import { 
  Search, Plus, Edit, Trash2, Car, Bike, MoreHorizontal, MapPin, Upload, Download, 
  AlertCircle, CheckCircle, Loader2, Wrench, CircleCheck, CircleDot, 
  Activity, Clock, XCircle, Navigation, Zap, RefreshCw, Signal, Copy, Image as ImageIcon, X, UserPlus
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useVehicles, useCreateVehicle, useUpdateVehicleStatus, useUpdateVehicle, useDeleteVehicle } from '@/hooks/useAdminData';
import { useUffizioLiveData, type UffizioVehicle } from '@/hooks/useUffizioLiveData';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/hooks/useAuditLog';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { UffizioDevicePicker } from '@/components/admin/UffizioDevicePicker';
import { AssignVehicleDialog } from '@/components/admin/AssignVehicleDialog';
import { FLEET_CATEGORIES, fleetCategoryLabel, isValidFleetCategory } from '@/lib/fleetCategories';
import { resolveVehicleImage } from '@/lib/vehicleImages';
import { useAdminUser } from '@/hooks/useAdminUser';

interface ImportRow {
  model_name: string;
  license_plate: string;
  vehicle_type: string;
  rent_per_day: number;
  uffizio_device_id?: string;
  fleet_group?: string | null;
  /** Raw value the user typed for fleet_group, kept for error display when invalid. */
  fleet_group_raw?: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: Array<{ row: number; error: string }>;
}

// localStorage key for filter persistence on the Vehicles admin page.
const VEHICLES_FILTER_STORAGE_KEY = 'admin.vehicles.filters.v1';

interface PersistedFilters {
  search?: string;
  typeFilter?: string;
  statusFilter?: string;
  gpsFilter?: string;
  categoryFilter?: string;
}

const loadPersistedFilters = (): PersistedFilters => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(VEHICLES_FILTER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

// Normalize "N'LOOTTO", "n'lootto", "n lootto" → NLOOTTO. Mirror of edge-fn logic.
const normalizeFleetGroupInput = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase().replace(/['’\s-]/g, '');
  return isValidFleetCategory(upper) ? upper : null;
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'available': return 'verified';
    case 'rented': return 'active';
    case 'maintenance': return 'pending';
    default: return 'default';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'available': return VEHICLE.AVAILABLE;
    case 'rented': return VEHICLE.RENTED;
    case 'maintenance': return VEHICLE.MAINTENANCE;
    default: return status;
  }
};

const getGPSStatusIcon = (status: 'moving' | 'idle' | 'offline' | null) => {
  switch (status) {
    case 'moving': return <Activity className="h-3.5 w-3.5 text-green-500" />;
    case 'idle': return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    case 'offline': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    default: return <Signal className="h-3.5 w-3.5 text-muted-foreground" />;
  }
};

const getGPSStatusLabel = (status: 'moving' | 'idle' | 'offline' | null) => {
  switch (status) {
    case 'moving': return 'En mouvement';
    case 'idle': return 'Moteur allumé';
    case 'offline': return 'Hors ligne';
    default: return 'Non connecté';
  }
};

const formatLastUpdate = (dateStr: string) => {
  if (!dateStr) return 'N/A';
  try {
    // Try parsing common Uffizio date format: "11 Mar 2026 04:48:56"
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}j`;
  } catch {
    return dateStr;
  }
};

export default function AdminVehicles() {
  const queryClient = useQueryClient();
  const { customerId } = useAdminUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const persistedFilters = useRef<PersistedFilters>(loadPersistedFilters());
  const [search, setSearch] = useState(persistedFilters.current.search ?? '');
  const [statusFilter, setStatusFilter] = useState(persistedFilters.current.statusFilter ?? 'all');
  const [gpsFilter, setGpsFilter] = useState(persistedFilters.current.gpsFilter ?? 'all');
  const [categoryFilter, setCategoryFilter] = useState(persistedFilters.current.categoryFilter ?? 'all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Persist filters whenever they change so admins keep their view across reloads.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        VEHICLES_FILTER_STORAGE_KEY,
        JSON.stringify({ search, statusFilter, gpsFilter, categoryFilter }),
      );
    } catch {
      // Ignore quota / privacy mode failures — filters simply won't persist.
    }
  }, [search, statusFilter, gpsFilter, categoryFilter]);
  
  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // New vehicle form state
  const [newVehicle, setNewVehicle] = useState({
    model_name: '',
    license_plate: '',
    vehicle_type: '',
    fleet_group: '',
    rent_per_day: '',
    uffizio_device_id: '',
    image_url: '',
  });
  const [uploadingNewImage, setUploadingNewImage] = useState(false);
  const [uploadingEditImage, setUploadingEditImage] = useState(false);

  const uploadVehicleImage = async (file: File): Promise<string | null> => {
    if (!customerId) {
      toast.error('Aucun client sélectionné');
      return null;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image');
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'image dépasse 5 Mo", { duration: Infinity, description: `Fichier: ${(file.size / 1024 / 1024).toFixed(1)} Mo. Maximum: 5 Mo.` });
      return null;
    }
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${customerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('vehicle-photos').upload(path, file, { upsert: false, contentType: file.type });
    if (error) {
      toast.error(`Erreur d'upload: ${error.message}`);
      return null;
    }
    return supabase.storage.from('vehicle-photos').getPublicUrl(path).data.publicUrl;
  };

  // Edit/delete state
  const [editingVehicle, setEditingVehicle] = useState<{
    id: string;
    model_name: string;
    license_plate: string;
    vehicle_type: string;
    fleet_group: string;
    rent_per_day: string;
    uffizio_device_id: string;
    image_url: string;
  } | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<{ id: string; model_name: string; license_plate: string } | null>(null);
  const [assigningVehicle, setAssigningVehicle] = useState<{ id: string; model_name: string; license_plate: string; rent_per_day: number | null } | null>(null);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [removePhotoError, setRemovePhotoError] = useState<string | null>(null);

  // Pending image selection (for preview-before-upload)
  const [pendingNewImage, setPendingNewImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [pendingEditImage, setPendingEditImage] = useState<{ file: File; previewUrl: string } | null>(null);

  const validateImage = (file: File): boolean => {
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image');
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'image dépasse 5 Mo", {
        duration: Infinity,
        description: `Fichier: ${(file.size / 1024 / 1024).toFixed(1)} Mo. Maximum: 5 Mo.`,
      });
      return false;
    }
    return true;
  };

  const handleSelectNewImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!validateImage(file)) return;
    if (pendingNewImage) URL.revokeObjectURL(pendingNewImage.previewUrl);
    setPendingNewImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleSelectEditImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!validateImage(file)) return;
    if (pendingEditImage) URL.revokeObjectURL(pendingEditImage.previewUrl);
    setPendingEditImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const clearPendingNewImage = () => {
    if (pendingNewImage) URL.revokeObjectURL(pendingNewImage.previewUrl);
    setPendingNewImage(null);
  };

  const clearPendingEditImage = () => {
    if (pendingEditImage) URL.revokeObjectURL(pendingEditImage.previewUrl);
    setPendingEditImage(null);
  };

  const { data: vehicles, isLoading } = useVehicles();
  const createVehicle = useCreateVehicle();
  const updateVehicleStatus = useUpdateVehicleStatus();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();
  
  // Live GPS data
  const { vehicles: gpsVehicles, loading: gpsLoading, lastRefresh, refresh: refreshGPS, stats: gpsStats } = useUffizioLiveData({
    autoRefresh: true,
    refreshInterval: 180000,
  });

  // Match GPS data to DB vehicles by license plate
  const gpsMap = useMemo(() => {
    const map = new Map<string, UffizioVehicle>();
    gpsVehicles.forEach(gv => {
      // Normalize plate: remove spaces, uppercase
      const normalized = gv.vehicle_no.replace(/\s+/g, ' ').trim().toUpperCase();
      map.set(normalized, gv);
      // Also store by raw key
      map.set(gv.vehicle_no, gv);
    });
    return map;
  }, [gpsVehicles]);

  type GpsMatchSource = 'plate' | 'manual' | 'fuzzy';
  const getGPSMatch = (
    licensePlate: string,
    uffizioDeviceId?: string | null,
  ): { gps: UffizioVehicle | null; source: GpsMatchSource | null } => {
    // Try exact match on license plate
    const normalized = licensePlate.replace(/\s+/g, ' ').trim().toUpperCase();
    if (gpsMap.has(normalized)) return { gps: gpsMap.get(normalized)!, source: 'plate' };
    if (gpsMap.has(licensePlate)) return { gps: gpsMap.get(licensePlate)!, source: 'plate' };

    // Try matching by uffizio device id / vehicle_no
    if (uffizioDeviceId) {
      for (const gv of gpsVehicles) {
        if (gv.imei_no === uffizioDeviceId || gv.device_name === uffizioDeviceId || gv.vehicle_no === uffizioDeviceId) {
          return { gps: gv, source: 'manual' };
        }
      }
    }

    // Fuzzy: check if GPS vehicle_no contains the license plate or vice versa
    for (const gv of gpsVehicles) {
      const gvPlate = gv.vehicle_no.replace(/\s+/g, '').toUpperCase();
      const dbPlate = normalized.replace(/\s+/g, '').replace(/-/g, '');
      const gvClean = gvPlate.replace(/-/g, '');
      if (gvClean.includes(dbPlate) || dbPlate.includes(gvClean)) {
        return { gps: gv, source: 'fuzzy' };
      }
    }

    return { gps: null, source: null };
  };

  const getGPSForVehicle = (licensePlate: string, uffizioDeviceId?: string | null): UffizioVehicle | null => {
    return getGPSMatch(licensePlate, uffizioDeviceId).gps;
  };

  const copyToClipboard = async (value: string, label = 'IMEI') => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copié`);
    } catch {
      toast.error('Impossible de copier');
    }
  };

  const matchSourceLabel = (source: GpsMatchSource | null): string => {
    if (source === 'plate') return 'Auto (immatriculation)';
    if (source === 'manual') return 'Manuel (override Uffizio)';
    if (source === 'fuzzy') return 'Auto (correspondance approx.)';
    return '';
  };

  const matchSourceBadgeClass = (source: GpsMatchSource | null): string => {
    if (source === 'manual') return 'border-amber-500/40 text-amber-600';
    if (source === 'fuzzy') return 'border-blue-500/40 text-blue-600';
    return 'border-emerald-500/40 text-emerald-600';
  };

  const handleStatusChange = (vehicleId: string, newStatus: string) => {
    updateVehicleStatus.mutate({ vehicleId, status: newStatus });
  };

  // Build a unified list: DB vehicles + GPS-only vehicles
  interface MergedVehicle {
    id: string;
    model_name: string;
    license_plate: string;
    vehicle_type: string;
    rent_per_day: number;
    status: string;
    image_url?: string | null;
    uffizio_device_id?: string | null;
    fleet_group?: string | null;
    source: 'db' | 'gps-only';
    gps: UffizioVehicle | null;
    gpsMatchSource: GpsMatchSource | null;
  }

  const mergedVehicles = useMemo(() => {
    const result: MergedVehicle[] = [];
    const matchedGPSIds = new Set<string>();

    // First: DB vehicles, attach GPS if matched
    (vehicles || []).forEach(vehicle => {
      const match = getGPSMatch(vehicle.license_plate, vehicle.uffizio_device_id);
      const gps = match.gps;
      if (gps) matchedGPSIds.add(gps.id);
      result.push({
        id: vehicle.id,
        model_name: vehicle.model_name,
        license_plate: vehicle.license_plate,
        vehicle_type: vehicle.vehicle_type,
        rent_per_day: vehicle.rent_per_day,
        status: vehicle.status,
        image_url: vehicle.image_url,
        uffizio_device_id: vehicle.uffizio_device_id,
        fleet_group: (vehicle as any).fleet_group ?? null,
        source: 'db',
        gps,
        gpsMatchSource: match.source,
      });
    });

    // Second: GPS-only vehicles (not matched to any DB record)
    gpsVehicles.forEach(gv => {
      if (!matchedGPSIds.has(gv.id)) {
        result.push({
          id: `gps-${gv.id}`,
          model_name: gv.device_name || gv.vehicle_no,
          license_plate: gv.vehicle_no,
          vehicle_type: 'car', // default
          rent_per_day: 0,
          status: 'available',
          image_url: null,
          uffizio_device_id: gv.imei_no,
          fleet_group: null,
          source: 'gps-only',
          gps: gv,
          gpsMatchSource: null,
        });
      }
    });

    return result;
  }, [vehicles, gpsVehicles, gpsMap]);

  // Set of IMEIs already attached to a DB vehicle (manual override OR via matched GPS).
  // Used by the device picker to flag duplicates.
  const assignedImeis = useMemo(() => {
    const set = new Set<string>();
    (vehicles || []).forEach(v => {
      if (v.uffizio_device_id) set.add(v.uffizio_device_id);
      const m = getGPSMatch(v.license_plate, v.uffizio_device_id);
      if (m.gps?.imei_no) set.add(m.gps.imei_no);
    });
    return set;
  }, [vehicles, gpsMap]);

  const filteredVehicles = mergedVehicles.filter((vehicle) => {
    const matchesSearch = vehicle.model_name.toLowerCase().includes(search.toLowerCase()) ||
                         vehicle.license_plate.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;

    // Category filter — "none" matches vehicles without an assigned fleet group.
    let matchesCategory = true;
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'none') {
        matchesCategory = !vehicle.fleet_group;
      } else {
        matchesCategory = vehicle.fleet_group === categoryFilter;
      }
    }

    // GPS status filter
    if (gpsFilter !== 'all') {
      const gps = vehicle.gps;
      if (gpsFilter === 'connected' && !gps) return false;
      if (gpsFilter === 'disconnected' && gps) return false;
      if (gpsFilter === 'moving' && gps?.status !== 'moving') return false;
      if (gpsFilter === 'idle' && gps?.status !== 'idle') return false;
      if (gpsFilter === 'offline' && gps?.status !== 'offline') return false;
    }

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const handleAddVehicle = async () => {
    if (!newVehicle.model_name || !newVehicle.license_plate || !newVehicle.vehicle_type || !newVehicle.rent_per_day) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    const dailyRate = parseInt(newVehicle.rent_per_day);

    let imageUrl: string | null = newVehicle.image_url || null;
    if (pendingNewImage) {
      setUploadingNewImage(true);
      const uploaded = await uploadVehicleImage(pendingNewImage.file);
      setUploadingNewImage(false);
      if (!uploaded) return;
      imageUrl = uploaded;
    }

    createVehicle.mutate({
      model_name: newVehicle.model_name,
      license_plate: newVehicle.license_plate.toUpperCase(),
      vehicle_type: newVehicle.vehicle_type,
      rent_per_day: dailyRate,
      uffizio_device_id: newVehicle.uffizio_device_id || null,
      image_url: imageUrl,
      fleet_group: newVehicle.fleet_group || null,
      status: 'available',
    }, {
      onSuccess: () => {
        setIsAddDialogOpen(false);
        setNewVehicle({ model_name: '', license_plate: '', vehicle_type: '', fleet_group: '', rent_per_day: '', uffizio_device_id: '', image_url: '' });
        clearPendingNewImage();
      },
    });
  };

  // CSV Import
  const parseCSV = (text: string): { rows: ImportRow[]; errors: string[] } => {
    const lines = text.split('\n').filter(line => line.trim());
    const errors: string[] = [];
    const rows: ImportRow[] = [];

    if (lines.length < 2) {
      errors.push('Le fichier doit contenir au moins une ligne d\'en-tête et une ligne de données');
      return { rows, errors };
    }

    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    const modelIdx = header.findIndex(h => h.includes('model') || h.includes('modele') || h === 'model_name');
    const plateIdx = header.findIndex(h => h.includes('plate') || h.includes('immat') || h === 'license_plate');
    const typeIdx = header.findIndex(h => h.includes('type') || h === 'vehicle_type');
    const dailyIdx = header.findIndex(h => h.includes('day') || h.includes('jour') || h === 'rent_per_day');
    // weekly_rate is a legacy column — silently ignored if present.
    const deviceIdx = header.findIndex(h => h.includes('uffizio') || h.includes('device') || h.includes('gps'));
    // Optional column: fleet_group / catégorie / category. Backwards compatible
    // with files exported before this column existed (silently ignored if absent).
    const fleetGroupIdx = header.findIndex(h =>
      h === 'fleet_group' || h === 'category' || h === 'categorie' || h === 'catégorie' || h.includes('catégor')
    );

    if (modelIdx === -1) errors.push('Colonne "model_name" ou "modele" non trouvée');
    if (plateIdx === -1) errors.push('Colonne "license_plate" ou "immatriculation" non trouvée');
    if (typeIdx === -1) errors.push('Colonne "vehicle_type" ou "type" non trouvée');
    if (dailyIdx === -1) errors.push('Colonne "rent_per_day" ou "tarif_jour" non trouvée');
    if (errors.length > 0) return { rows, errors };

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length < Math.max(modelIdx, plateIdx, typeIdx, dailyIdx) + 1) {
        errors.push(`Ligne ${i + 1}: Données manquantes`);
        continue;
      }

      const rentPerDay = parseInt(values[dailyIdx]);
      if (isNaN(rentPerDay) || rentPerDay <= 0) {
        errors.push(`Ligne ${i + 1}: Tarif journalier invalide`);
        continue;
      }

      const rawFleetGroup = fleetGroupIdx !== -1 ? (values[fleetGroupIdx] ?? '') : '';
      const normalizedFleetGroup = rawFleetGroup ? normalizeFleetGroupInput(rawFleetGroup) : null;
      if (rawFleetGroup && !normalizedFleetGroup) {
        errors.push(`Ligne ${i + 1}: Catégorie "${rawFleetGroup}" invalide (VTC, WARREN, CARGO, N'LOOTTO)`);
        continue;
      }

      const row: ImportRow = {
        model_name: values[modelIdx],
        license_plate: values[plateIdx],
        vehicle_type: values[typeIdx],
        rent_per_day: rentPerDay,
        uffizio_device_id: deviceIdx !== -1 ? values[deviceIdx] : undefined,
        fleet_group: normalizedFleetGroup,
        fleet_group_raw: rawFleetGroup || undefined,
      };

      if (!row.model_name || !row.license_plate || !row.vehicle_type) {
        errors.push(`Ligne ${i + 1}: Champs requis manquants`);
        continue;
      }

      rows.push(row);
    }

    return { rows, errors };
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) { toast.error('Veuillez sélectionner un fichier CSV'); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows, errors } = parseCSV(text);
      setImportData(rows);
      setImportErrors(errors);
      setImportResult(null);
      setShowImportModal(true);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (importData.length === 0) return;
    setIsImporting(true);
    try {
      // Strip the UI-only `fleet_group_raw` field before sending to the backend.
      const payload = importData.map(({ fleet_group_raw, ...rest }) => rest);
      const { data, error } = await supabase.functions.invoke('import-vehicles', { body: { vehicles: payload } });
      if (error) throw error;
      setImportResult(data as ImportResult);
      if (data.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
        toast.success(`${data.imported} véhicule(s) importé(s)`);
        logAction({ action: 'vehicle_added', targetType: 'vehicle', details: { count: data.imported, bulk: true } });
      }
      if (data.errors?.length > 0) toast.warning(`${data.errors.length} erreur(s) lors de l'import`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Erreur lors de l\'import');
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template =
      'model_name,license_plate,vehicle_type,rent_per_day,uffizio_device_id,fleet_group\n' +
      'Toyota Corolla 2020,AB-1234-CI,car,15000,UFF001,VTC\n' +
      "Honda PCX 150,MO-5678-CI,bike,5000,,N'LOOTTO";
    const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_vehicules.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Modèle téléchargé');
  };

  // CSV export — escapes any value that contains a comma, quote, or newline so
  // the file round-trips cleanly through Excel / Google Sheets / our own parser.
  const csvEscape = (value: unknown): string => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const handleExport = () => {
    // Export only DB-backed vehicles (GPS-only entries don't have rates/IDs in our system).
    // Honor the active filters so admins can export a tenant- or category-specific slice.
    const rowsToExport = filteredVehicles.filter(v => v.source === 'db');
    if (rowsToExport.length === 0) {
      toast.error('Aucun véhicule à exporter');
      return;
    }
    const headers = ['model_name', 'license_plate', 'vehicle_type', 'rent_per_day', 'uffizio_device_id', 'fleet_group', 'status'];
    const lines = [headers.join(',')];
    rowsToExport.forEach(v => {
      lines.push([
        csvEscape(v.model_name),
        csvEscape(v.license_plate),
        csvEscape(v.vehicle_type),
        csvEscape(v.rent_per_day),
        csvEscape(v.uffizio_device_id ?? ''),
        csvEscape(v.fleet_group ?? ''),
        csvEscape(v.status),
      ].join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `vehicules_${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`${rowsToExport.length} véhicule(s) exporté(s)`);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Véhicules' }]} />
        <ListPageSkeleton columns={6} rows={8} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Véhicules' }]} />
      <input type="file" ref={fileInputRef} accept=".csv" onChange={handleFileSelect} className="hidden" />

      <AdminPageHeader 
        title={ADMIN.VEHICLES.TITLE}
        description={`${mergedVehicles.length} véhicules dans la flotte · ${gpsVehicles.length} connectés GPS · ${vehicles?.length || 0} en base`}
        action={
          <div className="flex gap-2 items-center">
            {lastRefresh && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                GPS: {lastRefresh.toLocaleTimeString('fr-FR')}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={refreshGPS} disabled={gpsLoading}>
              {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Exporter
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Importer
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {ADMIN.VEHICLES.ADD_VEHICLE}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{ADMIN.VEHICLES.ADD_VEHICLE}</DialogTitle>
                  <DialogDescription>Ajouter un nouveau véhicule à la flotte</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Modèle *</Label>
                    <Input placeholder="Toyota Corolla 2020" value={newVehicle.model_name} onChange={(e) => setNewVehicle(prev => ({ ...prev, model_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Immatriculation *</Label>
                    <Input placeholder="AB-1234-CI" value={newVehicle.license_plate} onChange={(e) => setNewVehicle(prev => ({ ...prev, license_plate: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type *</Label>
                      <Select value={newVehicle.vehicle_type} onValueChange={(value) => setNewVehicle(prev => ({ ...prev, vehicle_type: value }))}>
                        <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="car">{VEHICLE.CAR}</SelectItem>
                          <SelectItem value="bike">{VEHICLE.BIKE}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Catégorie</Label>
                      <Select value={newVehicle.fleet_group || 'none'} onValueChange={(value) => setNewVehicle(prev => ({ ...prev, fleet_group: value === 'none' ? '' : value }))}>
                        <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Aucune</SelectItem>
                          {FLEET_CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>ID Uffizio (IMEI)</Label>
                    <UffizioDevicePicker
                      value={newVehicle.uffizio_device_id}
                      onChange={(v) => setNewVehicle(prev => ({ ...prev, uffizio_device_id: v }))}
                      devices={gpsVehicles}
                      assignedImeis={assignedImeis}
                      licensePlateHint={newVehicle.license_plate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{ADMIN.VEHICLES.DAILY_RATE} *</Label>
                    <Input type="number" placeholder="15000" value={newVehicle.rent_per_day} onChange={(e) => setNewVehicle(prev => ({ ...prev, rent_per_day: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Photo du véhicule (optionnel)</Label>
                    {pendingNewImage ? (
                      <div className="flex items-start gap-3 rounded-md border p-3 bg-muted/30">
                        <img src={pendingNewImage.previewUrl} alt="Aperçu" className="h-20 w-20 rounded object-cover border" />
                        <div className="flex-1 min-w-0 text-sm">
                          <p className="font-medium truncate">{pendingNewImage.file.name}</p>
                          <p className="text-xs text-muted-foreground">{(pendingNewImage.file.size / 1024 / 1024).toFixed(2)} Mo</p>
                          <p className="text-xs text-muted-foreground mt-1">Sera téléversée à l'enregistrement.</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={clearPendingNewImage} aria-label="Retirer l'image">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
                        <ImageIcon className="h-4 w-4" />
                        <span>Choisir une image (max 5 Mo)</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleSelectNewImage} />
                      </label>
                    )}
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); clearPendingNewImage(); }}>{UI.CANCEL}</Button>
                    <Button onClick={handleAddVehicle} disabled={createVehicle.isPending || uploadingNewImage}>
                      {uploadingNewImage ? 'Téléversement...' : createVehicle.isPending ? 'Ajout...' : UI.SAVE}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Fleet GPS Overview */}
      <FleetGPSOverview vehicles={gpsVehicles} loading={gpsLoading} />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher plaque, modèle..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="available">{VEHICLE.AVAILABLE}</SelectItem>
                <SelectItem value="rented">{VEHICLE.RENTED}</SelectItem>
                <SelectItem value="maintenance">{VEHICLE.MAINTENANCE}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={gpsFilter} onValueChange={setGpsFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="GPS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous GPS</SelectItem>
                <SelectItem value="moving">🟢 En mouvement</SelectItem>
                <SelectItem value="idle">🟡 À l'arrêt</SelectItem>
                <SelectItem value="offline">🔴 Hors ligne</SelectItem>
                <SelectItem value="connected">Connectés</SelectItem>
                <SelectItem value="disconnected">Non connectés</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {FLEET_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
                <SelectItem value="none">Sans catégorie</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Véhicule</TableHead>
                <TableHead>Immatriculation</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>{ADMIN.VEHICLES.DAILY_RATE}</TableHead>
                <TableHead>Statut flotte</TableHead>
                <TableHead>GPS Live</TableHead>
                <TableHead>Vitesse</TableHead>
                <TableHead>Dernière pos.</TableHead>
                <TableHead className="w-12">{UI.ACTIONS}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Aucun véhicule trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredVehicles.map((vehicle) => {
                  const gps = vehicle.gps;
                  const isGPSOnly = vehicle.source === 'gps-only';
                  return (
                    <TableRow key={vehicle.id} className={cn(gps?.status === 'moving' && 'bg-green-500/5')}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center relative overflow-hidden">
                            {(() => {
                              const resolved = resolveVehicleImage(vehicle.image_url, vehicle.model_name);
                              return resolved ? (
                                <img src={resolved} alt={vehicle.model_name} className="w-full h-full object-cover" />
                              ) : vehicle.vehicle_type === 'car' ? (
                                <Car className="h-5 w-5 text-muted-foreground" />
                              ) : (
                                <Bike className="h-5 w-5 text-muted-foreground" />
                              );
                            })()}
                            {gps && (
                              <div className={cn(
                                'absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-background',
                                gps.status === 'moving' && 'bg-green-500',
                                gps.status === 'idle' && 'bg-amber-500',
                                gps.status === 'offline' && 'bg-red-500',
                              )} />
                            )}
                          </div>
                          <div>
                            <span className="block">
                              {vehicle.model_name}
                              {isGPSOnly && (
                                <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0">GPS seul</Badge>
                              )}
                            </span>
                            {gps?.ignition && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Zap className="h-2.5 w-2.5" />
                                {gps.ignition === '1' || gps.ignition === 'ON' ? 'Contact ON' : 'Contact OFF'}
                              </span>
                            )}
                            {gps?.driver_name && (
                              <span className="text-[10px] text-muted-foreground block">
                                🧑 {gps.driver_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <div>{vehicle.license_plate}</div>
                        {gps?.imei_no ? (
                          <div className="mt-0.5 space-y-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-normal cursor-help">
                                  <span>IMEI: <span className="font-mono">{gps.imei_no}</span></span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(gps.imei_no!, 'IMEI');
                                    }}
                                    className="inline-flex items-center justify-center rounded p-0.5 hover:bg-accent hover:text-accent-foreground transition-colors"
                                    aria-label="Copier l'IMEI"
                                    title="Copier l'IMEI"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Device: {gps.device_name || '—'}</p>
                                <p className="text-xs">IMEI: {gps.imei_no}</p>
                                {gps.vehicle_no && <p className="text-xs">N° Uffizio: {gps.vehicle_no}</p>}
                                {vehicle.gpsMatchSource && (
                                  <p className="text-xs mt-1 pt-1 border-t border-border/50">
                                    Source: {matchSourceLabel(vehicle.gpsMatchSource)}
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                            {vehicle.gpsMatchSource && vehicle.source === 'db' && (
                              <Badge
                                variant="outline"
                                className={cn('text-[9px] px-1 py-0 font-normal h-4', matchSourceBadgeClass(vehicle.gpsMatchSource))}
                              >
                                {vehicle.gpsMatchSource === 'manual' ? 'Manuel' : vehicle.gpsMatchSource === 'fuzzy' ? 'Auto ~' : 'Auto'}
                              </Badge>
                            )}
                          </div>
                        ) : !isGPSOnly ? (
                          <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                            Aucun GPS associé
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {vehicle.vehicle_type === 'car' ? VEHICLE.CAR : VEHICLE.BIKE}
                        </Badge>
                      </TableCell>
                      <TableCell>{isGPSOnly ? <span className="text-muted-foreground text-xs">—</span> : formatCurrency(vehicle.rent_per_day)}</TableCell>
                      <TableCell>
                        {isGPSOnly ? (
                          <Badge variant="outline" className="text-muted-foreground">GPS uniquement</Badge>
                        ) : (
                          <Badge variant={getStatusBadgeVariant(vehicle.status) as never}>
                            {getStatusLabel(vehicle.status)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {getGPSStatusIcon(gps?.status || null)}
                          <span className={cn(
                            'text-xs',
                            gps?.status === 'moving' && 'text-green-600 font-medium',
                            gps?.status === 'idle' && 'text-amber-600',
                            gps?.status === 'offline' && 'text-red-500',
                            !gps && 'text-muted-foreground',
                          )}>
                            {getGPSStatusLabel(gps?.status || null)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {gps ? (
                          <div className="flex items-center gap-1">
                            <Navigation className="h-3 w-3 text-muted-foreground" />
                            <span className={cn(
                              'text-sm font-medium',
                              gps.speed > 80 && 'text-red-500',
                              gps.speed > 0 && gps.speed <= 80 && 'text-green-600',
                            )}>
                              {Math.round(gps.speed)} km/h
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {gps ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                                <Clock className="h-3 w-3" />
                                <span>{formatLastUpdate(gps.last_update)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{gps.last_update}</p>
                              {gps.lat !== 0 && <p className="text-xs">📍 {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}</p>}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover z-50">
                            {!isGPSOnly && (
                              <DropdownMenuItem
                                onClick={() => setEditingVehicle({
                                  id: vehicle.id,
                                  model_name: vehicle.model_name,
                                  license_plate: vehicle.license_plate,
                                  vehicle_type: vehicle.vehicle_type,
                                  fleet_group: (vehicle as any).fleet_group ?? '',
                                  rent_per_day: String(vehicle.rent_per_day ?? ''),
                                  uffizio_device_id: vehicle.uffizio_device_id ?? '',
                                  image_url: vehicle.image_url ?? '',
                                })}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                {UI.EDIT}
                              </DropdownMenuItem>
                            )}
                            {gps && (
                              <DropdownMenuItem asChild>
                                <Link to="/admin/tracking" className="flex items-center">
                                  <MapPin className="h-4 w-4 mr-2" />
                                  Voir sur la carte
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {!isGPSOnly && (
                              <>
                                <DropdownMenuSeparator />
                                {vehicle.status === 'available' && (
                                  <DropdownMenuItem
                                    onClick={() => setAssigningVehicle({
                                      id: vehicle.id,
                                      model_name: vehicle.model_name,
                                      license_plate: vehicle.license_plate,
                                      rent_per_day: vehicle.rent_per_day ?? null,
                                    })}
                                  >
                                    <UserPlus className="h-4 w-4 mr-2 text-primary" />
                                    Allouer à un conducteur
                                  </DropdownMenuItem>
                                )}
                                {vehicle.status !== 'available' && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(vehicle.id, 'available')} disabled={updateVehicleStatus.isPending}>
                                    <CircleCheck className="h-4 w-4 mr-2 text-green-500" />
                                    Marquer disponible
                                  </DropdownMenuItem>
                                )}
                                {vehicle.status !== 'maintenance' && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(vehicle.id, 'maintenance')} disabled={updateVehicleStatus.isPending}>
                                    <Wrench className="h-4 w-4 mr-2 text-amber-500" />
                                    Mettre en maintenance
                                  </DropdownMenuItem>
                                )}
                                {vehicle.status !== 'rented' && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(vehicle.id, 'rented')} disabled={updateVehicleStatus.isPending}>
                                    <CircleDot className="h-4 w-4 mr-2 text-blue-500" />
                                    Marquer en location
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setDeletingVehicle({
                                    id: vehicle.id,
                                    model_name: vehicle.model_name,
                                    license_plate: vehicle.license_plate,
                                  })}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {UI.DELETE}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* GPS data notice */}
      <Card className="mt-4 border-green-500/30 bg-green-500/5">
        <CardContent className="p-3">
          <div className="flex items-center gap-3 text-xs">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-muted-foreground">
              Données GPS live Uffizio/Trakzee · {gpsVehicles.length} trackers actifs · 
              Actualisation auto toutes les 3 min
              {lastRefresh && ` · Dernière: ${lastRefresh.toLocaleTimeString('fr-FR')}`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Import Modal */}
      <Dialog open={showImportModal} onOpenChange={(open) => {
        setShowImportModal(open);
        if (!open) { setImportData([]); setImportErrors([]); setImportResult(null); }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importer des véhicules</DialogTitle>
            <DialogDescription>
              Importez des véhicules depuis un fichier CSV. Colonnes requises: model_name, license_plate, vehicle_type (car/bike), rent_per_day. Colonnes optionnelles: uffizio_device_id, fleet_group (VTC, WARREN, CARGO, N'LOOTTO).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="text-sm">
                <p className="font-medium">Télécharger le modèle CSV</p>
                <p className="text-muted-foreground">Utilisez ce modèle pour formater vos données</p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Modèle
              </Button>
            </div>
            {importErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Erreurs de format:</p>
                  <ul className="list-disc list-inside text-sm">
                    {importErrors.slice(0, 5).map((error, i) => <li key={i}>{error}</li>)}
                    {importErrors.length > 5 && <li>...et {importErrors.length - 5} autre(s)</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {importResult && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">{importResult.imported} véhicule(s) importé(s) avec succès</p>
                  {importResult.errors.length > 0 && (
                    <ul className="list-disc list-inside text-sm">
                      {importResult.errors.slice(0, 5).map((error, i) => <li key={i}>Ligne {error.row}: {error.error}</li>)}
                    </ul>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {importData.length > 0 && !importResult && (
              <div className="space-y-2">
                <Label>Aperçu des données ({importData.length} véhicule(s))</Label>
                <ScrollArea className="h-48 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Modèle</TableHead>
                        <TableHead>Immat.</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Tarif/jour</TableHead>
                        <TableHead>Catégorie</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importData.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.model_name}</TableCell>
                          <TableCell className="font-mono text-xs">{row.license_plate}</TableCell>
                          <TableCell>{row.vehicle_type}</TableCell>
                          <TableCell>{formatCurrency(row.rent_per_day)}</TableCell>
                          <TableCell>{fleetCategoryLabel(row.fleet_group)}</TableCell>
                        </TableRow>
                      ))}
                      {importData.length > 10 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            ...et {importData.length - 10} autre(s)
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>{importResult ? 'Fermer' : 'Annuler'}</Button>
            {!importResult && (
              <Button onClick={handleImport} disabled={importData.length === 0 || isImporting}>
                {isImporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Import en cours...</> : <><Upload className="h-4 w-4 mr-2" />Importer {importData.length} véhicule(s)</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Vehicle Dialog */}
      <Dialog
        open={!!editingVehicle}
        onOpenChange={(open) => { if (!open) setEditingVehicle(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le véhicule</DialogTitle>
            <DialogDescription>Mettre à jour les informations du véhicule</DialogDescription>
          </DialogHeader>
          {editingVehicle && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Modèle *</Label>
                <Input
                  value={editingVehicle.model_name}
                  onChange={(e) => setEditingVehicle((prev) => prev && { ...prev, model_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Immatriculation *</Label>
                <Input
                  value={editingVehicle.license_plate}
                  onChange={(e) => setEditingVehicle((prev) => prev && { ...prev, license_plate: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select
                    value={editingVehicle.vehicle_type}
                    onValueChange={(value) => setEditingVehicle((prev) => prev && { ...prev, vehicle_type: value })}
                  >
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="car">{VEHICLE.CAR}</SelectItem>
                      <SelectItem value="bike">{VEHICLE.BIKE}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Select
                    value={editingVehicle.fleet_group || 'none'}
                    onValueChange={(value) => setEditingVehicle((prev) => prev && { ...prev, fleet_group: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      {FLEET_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>ID Uffizio (IMEI)</Label>
                <UffizioDevicePicker
                  value={editingVehicle.uffizio_device_id}
                  onChange={(v) => setEditingVehicle((prev) => prev && { ...prev, uffizio_device_id: v })}
                  devices={gpsVehicles}
                  assignedImeis={assignedImeis}
                  licensePlateHint={editingVehicle.license_plate}
                  currentVehicleId={editingVehicle.id}
                />
              </div>
              {(() => {
                const editMatch = getGPSMatch(editingVehicle.license_plate, editingVehicle.uffizio_device_id);
                const editGps = editMatch.gps;
                return (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-xs">
                    <div className="font-medium text-foreground flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" />
                        Device GPS Uffizio
                      </span>
                      {editGps && editMatch.source && (
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] font-normal', matchSourceBadgeClass(editMatch.source))}
                        >
                          {matchSourceLabel(editMatch.source)}
                        </Badge>
                      )}
                    </div>
                    {editGps ? (
                      <>
                        <div className="flex justify-between gap-2 items-center">
                          <span className="text-muted-foreground">IMEI</span>
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono">{editGps.imei_no || '—'}</span>
                            {editGps.imei_no && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => copyToClipboard(editGps.imei_no!, 'IMEI')}
                                aria-label="Copier l'IMEI"
                                title="Copier l'IMEI"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Nom du device</span>
                          <span>{editGps.device_name || '—'}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">N° véhicule Uffizio</span>
                          <span className="font-mono">{editGps.vehicle_no || '—'}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Dernière synchro</span>
                          <span>{formatLastUpdate(editGps.last_update)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Statut</span>
                          <span className="flex items-center gap-1">
                            {getGPSStatusIcon(editGps.status)}
                            {getGPSStatusLabel(editGps.status)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Aucun device GPS associé à cette immatriculation. Vérifiez l'immatriculation ou saisissez un ID Uffizio manuellement.
                      </p>
                    )}
                  </div>
                );
              })()}
              <div className="space-y-2">
                <Label>{ADMIN.VEHICLES.DAILY_RATE} *</Label>
                <Input
                  type="number"
                  value={editingVehicle.rent_per_day}
                  onChange={(e) => setEditingVehicle((prev) => prev && { ...prev, rent_per_day: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Photo du véhicule</Label>
                {pendingEditImage ? (
                  <div className="flex items-start gap-3 rounded-md border p-3 bg-muted/30">
                    <img src={pendingEditImage.previewUrl} alt="Aperçu" className="h-20 w-20 rounded object-cover border" />
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="font-medium truncate">{pendingEditImage.file.name}</p>
                      <p className="text-xs text-muted-foreground">{(pendingEditImage.file.size / 1024 / 1024).toFixed(2)} Mo</p>
                      <p className="text-xs text-muted-foreground mt-1">Sera téléversée à l'enregistrement.</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={clearPendingEditImage} aria-label="Retirer l'image">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : editingVehicle.image_url ? (
                  <div className="flex items-start gap-3 rounded-md border p-3 bg-muted/30 relative">
                    <div className="relative">
                      <img src={editingVehicle.image_url} alt="Photo actuelle" className={cn("h-20 w-20 rounded object-cover border", removingPhoto && "opacity-50")} />
                      {removingPhoto && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-destructive" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="font-medium">Photo actuelle</p>
                      <div className="flex gap-2 mt-2">
                        <label className={cn("inline-flex items-center gap-1 text-xs text-primary hover:underline", removingPhoto ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-pointer")}>
                          <ImageIcon className="h-3 w-3" /> Remplacer
                          <input type="file" accept="image/*" className="hidden" onChange={handleSelectEditImage} disabled={removingPhoto} />
                        </label>
                        <button
                          type="button"
                          disabled={removingPhoto}
                          onClick={() => { setRemovePhotoError(null); setConfirmRemovePhoto(true); }}
                          className="inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {removingPhoto ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          {removingPhoto ? 'Suppression…' : 'Supprimer'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
                    <ImageIcon className="h-4 w-4" />
                    <span>Choisir une image (max 5 Mo)</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleSelectEditImage} />
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setEditingVehicle(null); clearPendingEditImage(); }}>{UI.CANCEL}</Button>
                <Button
                  onClick={async () => {
                    if (!editingVehicle) return;
                    if (!editingVehicle.model_name || !editingVehicle.license_plate || !editingVehicle.vehicle_type || !editingVehicle.rent_per_day) {
                      toast.error('Veuillez remplir tous les champs obligatoires');
                      return;
                    }
                    const dailyRate = parseInt(editingVehicle.rent_per_day);
                    if (isNaN(dailyRate) || dailyRate <= 0) {
                      toast.error('Tarif journalier invalide');
                      return;
                    }

                    let imageUrl: string | null = editingVehicle.image_url || null;
                    if (pendingEditImage) {
                      setUploadingEditImage(true);
                      const uploaded = await uploadVehicleImage(pendingEditImage.file);
                      setUploadingEditImage(false);
                      if (!uploaded) return;
                      imageUrl = uploaded;
                    }

                    updateVehicle.mutate(
                      {
                        vehicleId: editingVehicle.id,
                        updates: {
                          model_name: editingVehicle.model_name,
                          license_plate: editingVehicle.license_plate.toUpperCase(),
                          vehicle_type: editingVehicle.vehicle_type,
                          rent_per_day: dailyRate,
                          uffizio_device_id: editingVehicle.uffizio_device_id || null,
                          image_url: imageUrl,
                          fleet_group: editingVehicle.fleet_group || null,
                        },
                      },
                      { onSuccess: () => { setEditingVehicle(null); clearPendingEditImage(); } }
                    );
                  }}
                  disabled={updateVehicle.isPending || uploadingEditImage}
                >
                  {uploadingEditImage ? 'Téléversement...' : updateVehicle.isPending ? 'Enregistrement...' : UI.SAVE}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Remove Photo */}
      <AlertDialog
        open={confirmRemovePhoto}
        onOpenChange={(open) => {
          if (removingPhoto) return; // block close while in flight
          if (!open) {
            setConfirmRemovePhoto(false);
            setRemovePhotoError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la photo ?</AlertDialogTitle>
            <AlertDialogDescription>
              La photo actuelle du véhicule sera retirée immédiatement. Cette action ne peut pas être annulée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removePhotoError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">Échec de la suppression</p>
                <p className="text-xs mt-1">{removePhotoError}</p>
                <p className="text-xs mt-1">Vérifiez votre connexion puis réessayez.</p>
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingPhoto}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={removingPhoto}
              onClick={async (e) => {
                e.preventDefault();
                if (!editingVehicle || removingPhoto) return;
                setRemovingPhoto(true);
                setRemovePhotoError(null);
                try {
                  const { error } = await supabase
                    .from('vehicles')
                    .update({ image_url: null })
                    .eq('id', editingVehicle.id);
                  if (error) throw error;
                  // Force preview to refresh by clearing the local image_url
                  setEditingVehicle((prev) => prev && { ...prev, image_url: '' });
                  queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
                  toast.success('Photo supprimée');
                  setConfirmRemovePhoto(false);
                } catch (err: any) {
                  const message = err?.message || err?.details || 'Erreur inconnue';
                  setRemovePhotoError(message);
                  toast.error('Échec de la suppression de la photo', {
                    description: message,
                    duration: Infinity,
                  });
                } finally {
                  setRemovingPhoto(false);
                }
              }}
            >
              {removingPhoto ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Suppression…</>
              ) : removePhotoError ? 'Réessayer' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Vehicle Confirmation */}
      <AlertDialog
        open={!!deletingVehicle}
        onOpenChange={(open) => { if (!open) setDeletingVehicle(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce véhicule ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingVehicle && (
                <>
                  Cette action est irréversible. Le véhicule{' '}
                  <span className="font-semibold">{deletingVehicle.model_name}</span> ({deletingVehicle.license_plate}) sera supprimé définitivement.
                  La suppression est bloquée si le véhicule a déjà été loué — utilisez plutôt la maintenance.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteVehicle.isPending}>{UI.CANCEL}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteVehicle.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!deletingVehicle) return;
                deleteVehicle.mutate(deletingVehicle.id, {
                  onSuccess: () => setDeletingVehicle(null),
                });
              }}
            >
              {deleteVehicle.isPending ? 'Suppression...' : UI.DELETE}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignVehicleDialog
        open={!!assigningVehicle}
        onOpenChange={(open) => { if (!open) setAssigningVehicle(null); }}
        vehicleId={assigningVehicle?.id}
        vehicleLabel={assigningVehicle ? `${assigningVehicle.model_name} · ${assigningVehicle.license_plate}` : undefined}
        defaultRate={assigningVehicle?.rent_per_day ?? null}
      />
    </AdminLayout>
  );
}
