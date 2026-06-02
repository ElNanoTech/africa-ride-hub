import { useState } from 'react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Plus, Pencil, Trash2, Shield, UserCheck, UserX, KeyRound, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import {
  useAdminUsers,
  useCreateAdminUser,
  useUpdateAdminUser,
  useDeleteAdminUser,
  useResetAdminPassword,
  AdminUserWithRoles,
} from '@/hooks/useAdminUsers';
import { formatDate } from '@/lib/format';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { RoleGuard } from '@/components/RoleGuard';

const AVAILABLE_ROLES = [
  { value: 'super_admin', label: 'Super Admin', description: 'Accès complet à toutes les fonctionnalités' },
  { value: 'manager', label: 'Manager', description: 'Gestion des chauffeurs, véhicules et locations' },
  { value: 'loan_officer', label: 'Agent de prêt', description: 'Gestion des prêts et paiements' },
  { value: 'support_agent', label: 'Agent support', description: 'Gestion des tickets de support' },
];

const getRoleBadgeColor = (role: string) => {
  switch (role) {
    case 'super_admin':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'manager':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'loan_officer':
      return 'bg-warning/10 text-warning border-warning/20';
    case 'support_agent':
      return 'bg-success/10 text-success border-success/20';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getRoleLabel = (role: string) => {
  return AVAILABLE_ROLES.find(r => r.value === role)?.label || role;
};

export default function AdminUsers() {
  const { data: users, isLoading, error, refetch } = useAdminUsers();
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();
  const resetPassword = useResetAdminPassword();
  const { canManageAdmins, isSuperAdmin } = useRoleGuard();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserWithRoles | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    is_active: true,
    roles: [] as string[],
  });

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      full_name: '',
      is_active: true,
      roles: [],
    });
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const handleOpenEdit = (user: AdminUserWithRoles) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      password: '',
      full_name: user.full_name,
      is_active: user.is_active,
      roles: user.roles,
    });
    setIsEditDialogOpen(true);
  };

  const handleOpenDelete = (user: AdminUserWithRoles) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!formData.email || !formData.password || !formData.full_name) return;
    
    await createUser.mutateAsync({
      email: formData.email,
      password: formData.password,
      full_name: formData.full_name,
      roles: formData.roles,
    });
    
    setIsCreateDialogOpen(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!selectedUser) return;
    
    await updateUser.mutateAsync({
      adminUserId: selectedUser.id,
      full_name: formData.full_name,
      is_active: formData.is_active,
      roles: formData.roles,
    });
    
    setIsEditDialogOpen(false);
    setSelectedUser(null);
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    
    await deleteUser.mutateAsync(selectedUser.id);
    
    setIsDeleteDialogOpen(false);
    setSelectedUser(null);
  };

  const toggleRole = (role: string) => {
    setFormData(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role],
    }));
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingState message="Chargement des administrateurs..." />
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <ErrorState 
          message="Erreur lors du chargement des administrateurs" 
          onRetry={() => refetch()} 
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Administrateurs' }]} />
      
      <AdminPageHeader
        title="Gestion des Administrateurs"
        description="Gérer les utilisateurs administrateurs et leurs rôles"
        action={
          <RoleGuard allowedRoles={['super_admin']}>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nouvel Admin
            </Button>
          </RoleGuard>
        }
      />

      {!users?.length ? (
        <EmptyState
          icon={<Shield className="h-8 w-8 text-muted-foreground" />}
          title="Aucun administrateur"
          description="Commencez par créer un administrateur"
          action={{
            label: 'Créer un administrateur',
            onClick: handleOpenCreate,
          }}
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôles</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Dernière connexion</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className={getRoleBadgeColor(role)}
                        >
                          {getRoleLabel(role)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.is_active ? (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                        <UserCheck className="h-3 w-3 mr-1" />
                        Actif
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        <UserX className="h-3 w-3 mr-1" />
                        Inactif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.last_login_at ? formatDate(user.last_login_at) : 'Jamais'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isSuperAdmin() ? (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => resetPassword.mutate({ email: user.email, reason: 'admin_initiated_recovery' })}
                                disabled={resetPassword.isPending}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Réinitialiser le mot de passe</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEdit(user)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Modifier</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleOpenDelete(user)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Supprimer</p>
                            </TooltipContent>
                          </Tooltip>
                        </>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="p-2 opacity-50">
                              <Lock className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Seul un Super Admin peut gérer les utilisateurs</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvel Administrateur</DialogTitle>
            <DialogDescription>
              Créez un nouveau compte administrateur avec les rôles appropriés.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nom complet</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="Jean Dupont"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="admin@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-3">
              <Label>Rôles</Label>
              <div className="space-y-2">
                {AVAILABLE_ROLES.map((role) => (
                  <div
                    key={role.value}
                    className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={`create-${role.value}`}
                      checked={formData.roles.includes(role.value)}
                      onCheckedChange={() => toggleRole(role.value)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`create-${role.value}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {role.label}
                      </label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {role.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createUser.isPending || !formData.email || !formData.password || !formData.full_name}
            >
              {createUser.isPending ? 'Création...' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier l'Administrateur</DialogTitle>
            <DialogDescription>
              Modifiez les informations et les rôles de cet administrateur.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_full_name">Nom complet</Label>
              <Input
                id="edit_full_name"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={formData.email}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <Label htmlFor="is_active">Compte actif</Label>
                <p className="text-xs text-muted-foreground">
                  Les comptes inactifs ne peuvent pas se connecter
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>

            <div className="space-y-3">
              <Label>Rôles</Label>
              <div className="space-y-2">
                {AVAILABLE_ROLES.map((role) => (
                  <div
                    key={role.value}
                    className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={`edit-${role.value}`}
                      checked={formData.roles.includes(role.value)}
                      onCheckedChange={() => toggleRole(role.value)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`edit-${role.value}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {role.label}
                      </label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {role.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateUser.isPending || !formData.full_name}
            >
              {updateUser.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'administrateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer {selectedUser?.full_name} ? 
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
