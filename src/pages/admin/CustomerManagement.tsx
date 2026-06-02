import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, 
  Plus, 
  Search, 
  Users, 
  Car, 
  UserCog,
  MoreVertical,
  Edit,
  Trash2,
  Power,
  PowerOff,
  Palette,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { useIsPlatformOwner } from '@/hooks/useFeatureFlags';
import { 
  useCustomersWithStats, 
  useCreateCustomer, 
  useUpdateCustomer, 
  useDeactivateCustomer 
} from '@/hooks/useCustomers';
import { useNavigate } from 'react-router-dom';

interface CustomerFormData {
  name: string;
  slug: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  is_active: boolean;
}

const defaultFormData: CustomerFormData = {
  name: '',
  slug: '',
  logo_url: '',
  primary_color: '#22c55e',
  secondary_color: '#3b82f6',
  is_active: true,
};

export default function CustomerManagement() {
  const navigate = useNavigate();
  const { data: isPlatformOwner, isLoading: ownerLoading } = useIsPlatformOwner();
  const { data: customers, isLoading: customersLoading } = useCustomersWithStats();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deactivateCustomer = useDeactivateCustomer();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<(CustomerFormData & { id: string }) | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(defaultFormData);

  // Redirect if not platform owner
  if (!ownerLoading && !isPlatformOwner) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Accès refusé</CardTitle>
              <CardDescription>
                Cette page est réservée aux propriétaires de la plateforme.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  const filteredCustomers = customers?.filter(customer =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateCustomer = async () => {
    if (!formData.name || !formData.slug) {
      toast.error('Nom et slug sont requis');
      return;
    }

    try {
      await createCustomer.mutateAsync(formData);
      toast.success('Client créé avec succès');
      setIsCreateDialogOpen(false);
      setFormData(defaultFormData);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la création');
    }
  };

  const handleUpdateCustomer = async () => {
    if (!editingCustomer) return;

    try {
      await updateCustomer.mutateAsync({
        id: editingCustomer.id,
        name: editingCustomer.name,
        slug: editingCustomer.slug,
        logo_url: editingCustomer.logo_url || null,
        primary_color: editingCustomer.primary_color,
        secondary_color: editingCustomer.secondary_color,
        is_active: editingCustomer.is_active,
      });
      toast.success('Client mis à jour');
      setEditingCustomer(null);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    }
  };

  const handleDeactivateCustomer = async (customerId: string, customerName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir désactiver "${customerName}" ? Les données seront conservées mais le client ne pourra plus accéder à la plateforme.`)) {
      return;
    }

    try {
      await deactivateCustomer.mutateAsync(customerId);
      toast.success('Client désactivé');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la désactivation');
    }
  };

  const handleToggleActive = async (customer: any) => {
    try {
      await updateCustomer.mutateAsync({
        id: customer.id,
        is_active: !customer.is_active,
      });
      toast.success(customer.is_active ? 'Client désactivé' : 'Client activé');
    } catch (error: any) {
      toast.error(error.message || 'Erreur');
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Gestion des Clients"
        description="Gérez les entreprises clientes de la plateforme (multi-tenant)"
        action={
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nouveau client
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Créer un nouveau client</DialogTitle>
                <DialogDescription>
                  Ajoutez une nouvelle entreprise à la plateforme
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom de l'entreprise</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        name: e.target.value,
                        slug: generateSlug(e.target.value),
                      });
                    }}
                    placeholder="DAM Flotte Abidjan"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (URL)</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="dam-flotte-abidjan"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logo">URL du logo</Label>
                  <Input
                    id="logo"
                    value={formData.logo_url}
                    onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="primary">Couleur primaire</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={formData.primary_color}
                        onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                        className="w-10 h-10 rounded border cursor-pointer"
                      />
                      <Input
                        value={formData.primary_color}
                        onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondary">Couleur secondaire</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={formData.secondary_color}
                        onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                        className="w-10 h-10 rounded border cursor-pointer"
                      />
                      <Input
                        value={formData.secondary_color}
                        onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label>Actif</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleCreateCustomer} disabled={createCustomer.isPending}>
                  {createCustomer.isPending ? 'Création...' : 'Créer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Customers Grid */}
      {customersLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <AnimatePresence>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCustomers?.map((customer, index) => (
              <motion.div
                key={customer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={!customer.is_active ? 'opacity-60' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {customer.logo_url ? (
                          <img
                            src={customer.logo_url}
                            alt={customer.name}
                            className="w-10 h-10 rounded-lg object-contain"
                          />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: customer.primary_color || '#22c55e' }}
                          >
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {customer.name}
                            {!customer.is_active && (
                              <Badge variant="outline" className="text-xs">Inactif</Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="font-mono text-xs">
                            /{customer.slug}
                          </CardDescription>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingCustomer({
                            id: customer.id,
                            name: customer.name,
                            slug: customer.slug,
                            logo_url: customer.logo_url || '',
                            primary_color: customer.primary_color || '#22c55e',
                            secondary_color: customer.secondary_color || '#3b82f6',
                            is_active: customer.is_active,
                          })}>
                            <Edit className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleActive(customer)}>
                            {customer.is_active ? (
                              <>
                                <PowerOff className="h-4 w-4 mr-2" />
                                Désactiver
                              </>
                            ) : (
                              <>
                                <Power className="h-4 w-4 mr-2" />
                                Activer
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {customer.is_active && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeactivateCustomer(customer.id, customer.name)}
                            >
                              <PowerOff className="h-4 w-4 mr-2" />
                              Désactiver définitivement
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <div className="text-lg font-bold">{customer.stats?.drivers || 0}</div>
                        <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <Users className="h-3 w-3" />
                          Conducteurs
                        </div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <div className="text-lg font-bold">{customer.stats?.vehicles || 0}</div>
                        <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <Car className="h-3 w-3" />
                          Véhicules
                        </div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <div className="text-lg font-bold">{customer.stats?.admins || 0}</div>
                        <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <UserCog className="h-3 w-3" />
                          Admins
                        </div>
                      </div>
                    </div>

                    {/* Colors preview */}
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                      <div
                        className="w-6 h-6 rounded-full border"
                        style={{ backgroundColor: customer.primary_color || '#22c55e' }}
                        title="Couleur primaire"
                      />
                      <div
                        className="w-6 h-6 rounded-full border"
                        style={{ backgroundColor: customer.secondary_color || '#3b82f6' }}
                        title="Couleur secondaire"
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingCustomer} onOpenChange={() => setEditingCustomer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le client</DialogTitle>
          </DialogHeader>
          {editingCustomer && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom de l'entreprise</Label>
                <Input
                  value={editingCustomer.name}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={editingCustomer.slug}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, slug: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>URL du logo</Label>
                <Input
                  value={editingCustomer.logo_url}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, logo_url: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Couleur primaire</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={editingCustomer.primary_color}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, primary_color: e.target.value })}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={editingCustomer.primary_color}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, primary_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Couleur secondaire</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={editingCustomer.secondary_color}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, secondary_color: e.target.value })}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={editingCustomer.secondary_color}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, secondary_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingCustomer.is_active}
                  onCheckedChange={(checked) => setEditingCustomer({ ...editingCustomer, is_active: checked })}
                />
                <Label>Actif</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCustomer(null)}>
              Annuler
            </Button>
            <Button onClick={handleUpdateCustomer} disabled={updateCustomer.isPending}>
              {updateCustomer.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
