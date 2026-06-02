import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Satellite, RefreshCw, Search, Users, Car, Phone, 
  Mail, Loader2, AlertTriangle, CheckCircle, Download
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';

interface GPSDriver {
  driver_id?: string;
  name: string;
  phone?: string;
  license_no?: string;
  vehicle_assigned?: string;
  email?: string;
  address?: string;
  rfid?: string;
  status?: string;
  source?: string;
}

export function GPSDriversList() {
  const [driversFromApi, setDriversFromApi] = useState<GPSDriver[]>([]);
  const [driversFromVehicles, setDriversFromVehicles] = useState<GPSDriver[]>([]);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [search, setSearch] = useState('');

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('sync-uffizio', {
        body: { action: 'getDriverList' },
      });
      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Échec de récupération');

      setDriversFromApi(data.drivers_from_api || []);
      setDriversFromVehicles(data.drivers_from_vehicles || []);
      setTotalVehicles(data.total_vehicles || 0);
      setFetched(true);
      toast.success(`${data.total_vehicles} véhicules scannés`);
    } catch (err: any) {
      console.error('GPS drivers fetch error:', err);
      setError(err.message);
      toast.error('Erreur de récupération des conducteurs GPS');
    } finally {
      setLoading(false);
    }
  }, []);

  const allDrivers = driversFromApi.length > 0 ? driversFromApi : driversFromVehicles;
  
  const filteredDrivers = allDrivers.filter(d => 
    d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.vehicle_assigned?.toLowerCase().includes(search.toLowerCase()) ||
    d.phone?.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    if (allDrivers.length === 0) return;
    const headers = ['Nom', 'Téléphone', 'Email', 'Véhicule assigné', 'N° Permis', 'Statut'];
    const rows = allDrivers.map(d => [
      d.name, d.phone || '', d.email || '', d.vehicle_assigned || '', d.license_no || '', d.status || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conducteurs-gps-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <Satellite className="h-5 w-5 text-primary" />
            Conducteurs GPS (Uffizio/Trakzee)
          </CardTitle>
          <div className="flex gap-2">
            {allDrivers.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
            <Button onClick={fetchDrivers} disabled={loading} size="sm" className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {fetched ? 'Actualiser' : 'Charger les conducteurs'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!fetched && !loading && (
          <div className="text-center py-12">
            <Satellite className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-4">
              Cliquez sur "Charger les conducteurs" pour récupérer la liste des conducteurs depuis le système GPS Uffizio/Trakzee.
            </p>
            <Button onClick={fetchDrivers} className="gap-2">
              <Satellite className="h-4 w-4" />
              Charger les conducteurs GPS
            </Button>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {fetched && !loading && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border p-3 text-center">
                <Car className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-xl font-bold">{totalVehicles}</p>
                <p className="text-[10px] text-muted-foreground">Véhicules GPS</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Users className="h-5 w-5 mx-auto mb-1 text-green-500" />
                <p className="text-xl font-bold">{allDrivers.length}</p>
                <p className="text-[10px] text-muted-foreground">Conducteurs trouvés</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <CheckCircle className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                <p className="text-xl font-bold">{driversFromApi.length}</p>
                <p className="text-[10px] text-muted-foreground">Via API conducteurs</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Car className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                <p className="text-xl font-bold">{driversFromVehicles.length}</p>
                <p className="text-[10px] text-muted-foreground">Via véhicules</p>
              </div>
            </div>

            {driversFromApi.length === 0 && driversFromVehicles.length === 0 && (
              <Alert className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Aucun conducteur trouvé dans le système GPS. Cela peut signifier que les conducteurs ne sont pas assignés aux véhicules dans Trakzee, 
                  ou que l'API conducteurs n'est pas disponible sur votre instance. Les noms de conducteurs apparaîtront ici une fois assignés dans le système GPS.
                </AlertDescription>
              </Alert>
            )}

            {allDrivers.length > 0 && (
              <>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher par nom, véhicule ou téléphone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Véhicule assigné</TableHead>
                        <TableHead>Téléphone</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>N° Permis</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDrivers.map((driver, i) => (
                        <TableRow key={`${driver.name}-${i}`}>
                          <TableCell className="font-medium">{driver.name || '—'}</TableCell>
                          <TableCell>
                            {driver.vehicle_assigned ? (
                              <Badge variant="outline" className="gap-1">
                                <Car className="h-3 w-3" />
                                {driver.vehicle_assigned}
                              </Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            {driver.phone ? (
                              <span className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {driver.phone}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            {driver.email ? (
                              <span className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                {driver.email}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell>{driver.license_no || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={driver.source === 'vehicle_assignment' ? 'secondary' : 'default'}>
                              {driver.source === 'vehicle_assignment' ? 'Véhicule' : 'API'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {filteredDrivers.length} conducteur(s) affiché(s) sur {allDrivers.length}
                </p>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
