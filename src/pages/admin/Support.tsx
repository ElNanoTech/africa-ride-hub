import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, MessageSquare, Clock, CheckCircle, AlertTriangle, Send, Phone } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useSupportTickets, useUpdateTicketStatus, useSendTicketReply } from '@/hooks/useAdminData';
import { VoicePlayer } from '@/components/VoicePlayer';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';

export default function AdminSupport() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<ReturnType<typeof useSupportTickets>['data'] extends (infer T)[] | undefined ? T : never>(null as never);
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSendingVoice, setIsSendingVoice] = useState(false);

  const { data: tickets, isLoading } = useSupportTickets();
  const updateStatus = useUpdateTicketStatus();
  const sendReply = useSendTicketReply();

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: 'default' | 'secondary' | 'approved' | 'high' | 'destructive'; label: string }> = {
      open: { variant: 'destructive', label: 'Ouvert' },
      in_progress: { variant: 'high', label: 'En cours' },
      resolved: { variant: 'approved', label: 'Résolu' },
      closed: { variant: 'secondary', label: 'Fermé' }
    };
    const config = configs[status] || configs.open;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const configs: Record<string, { variant: 'low' | 'normal' | 'high' | 'urgent'; label: string }> = {
      low: { variant: 'low', label: 'Basse' },
      normal: { variant: 'normal', label: 'Normale' },
      high: { variant: 'high', label: 'Haute' },
      urgent: { variant: 'urgent', label: 'Urgente' }
    };
    const config = configs[priority] || configs.normal;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      payment: 'Paiement',
      vehicle: 'Véhicule',
      score: 'Score',
      loan: 'Prêt',
      kyc: 'KYC',
      other: 'Autre'
    };
    return labels[category] || category;
  };

  const filteredTickets = (tickets || []).filter(ticket => {
    const matchesSearch = ticket.drivers?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ticket.ticket_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ticket.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || ticket.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Calculate stats
  const openCount = (tickets || []).filter(t => t.status === 'open').length;
  const inProgressCount = (tickets || []).filter(t => t.status === 'in_progress').length;
  const resolvedCount = (tickets || []).filter(t => t.status === 'resolved').length;

  const handleSendReply = () => {
    if (!replyMessage.trim() || !selectedTicket) return;
    sendReply.mutate({
      ticketId: selectedTicket.id,
      message: replyMessage,
      senderId: 'admin',
    });
    setReplyMessage('');
  };

  const handleSendVoiceAdmin = async (audioBlob: Blob) => {
    if (!selectedTicket) return;
    setIsSendingVoice(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      const fileName = `${user.id}/${selectedTicket.id}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, { contentType: 'audio/webm' });
      if (uploadError) throw uploadError;

      // Bucket is private — issue a long-lived signed URL (1 year).
      const { data: signed, error: signError } = await supabase.storage
        .from('voice-notes')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365);
      if (signError || !signed) throw signError ?? new Error('Signed URL failed');

      sendReply.mutate({
        ticketId: selectedTicket.id,
        message: '🎤 Message vocal',
        senderId: 'admin',
        attachmentUrl: signed.signedUrl,
      });
    } catch (err) {
      console.error('Voice upload error:', err);
      toast.error('Erreur lors de l\'envoi du vocal');
    } finally {
      setIsSendingVoice(false);
    }
  };

  const handleUpdateStatus = (newStatus: string) => {
    if (!selectedTicket) return;
    updateStatus.mutate({
      ticketId: selectedTicket.id,
      status: newStatus,
    });
  };

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Support' }]} />
      
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Support</h1>
          <p className="text-muted-foreground">Gestion des tickets de support</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ouverts</p>
                  <p className="text-2xl font-bold text-destructive">{openCount}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">En cours</p>
                  <p className="text-2xl font-bold text-warning">{inProgressCount}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Résolus (mois)</p>
                  <p className="text-2xl font-bold text-tier-gold">{resolvedCount}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-tier-gold/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-tier-gold" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Temps de réponse</p>
                  <p className="text-2xl font-bold">~2h</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par numéro, nom ou sujet..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="open">Ouvert</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="resolved">Résolu</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  <SelectItem value="payment">Paiement</SelectItem>
                  <SelectItem value="vehicle">Véhicule</SelectItem>
                  <SelectItem value="score">Score</SelectItem>
                  <SelectItem value="loan">Prêt</SelectItem>
                  <SelectItem value="kyc">KYC</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tickets Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Chauffeur</TableHead>
                <TableHead>Sujet</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Mise à jour</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Aucun ticket trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredTickets.map((ticket) => (
                  <TableRow key={ticket.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
                    setSelectedTicket(ticket);
                    setShowTicketDialog(true);
                  }}>
                    <TableCell className="font-mono text-sm">{ticket.ticket_number}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{ticket.drivers?.full_name || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">{ticket.drivers?.phone_number}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{ticket.subject}</TableCell>
                    <TableCell>{getCategoryLabel(ticket.category)}</TableCell>
                    <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                    <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(ticket.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTicket(ticket);
                        setShowTicketDialog(true);
                      }}>
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Ticket Detail Dialog */}
        <Dialog open={showTicketDialog} onOpenChange={setShowTicketDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{selectedTicket?.ticket_number}</span>
                {selectedTicket && getStatusBadge(selectedTicket.status)}
                {selectedTicket && getPriorityBadge(selectedTicket.priority)}
              </DialogTitle>
              <DialogDescription>{selectedTicket?.subject}</DialogDescription>
            </DialogHeader>
            
            {selectedTicket && (
              <div className="space-y-4">
                {/* Driver Info */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {selectedTicket.drivers?.full_name?.split(' ').map(n => n[0]).join('') || 'N/A'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{selectedTicket.drivers?.full_name || 'N/A'}</p>
                      <p className="text-sm text-muted-foreground">{getCategoryLabel(selectedTicket.category)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1">
                      <Phone className="h-3 w-3" />
                      Appeler
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Select onValueChange={handleUpdateStatus} defaultValue={selectedTicket.status}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Ouvert</SelectItem>
                      <SelectItem value="in_progress">En cours</SelectItem>
                      <SelectItem value="resolved">Résolu</SelectItem>
                      <SelectItem value="closed">Fermé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Messages */}
                <ScrollArea className="h-[300px] border rounded-lg p-4">
                  <div className="space-y-4">
                    {/* Initial description as first message */}
                    <div className="flex justify-start">
                      <div className="max-w-[80%] p-3 rounded-lg bg-muted">
                        <p className="text-sm">{selectedTicket.description}</p>
                        <p className="text-xs mt-1 text-muted-foreground">
                          {formatDate(selectedTicket.created_at)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Messages */}
                    {selectedTicket.support_ticket_messages?.map((msg) => (
                      <div 
                        key={msg.id} 
                        className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[80%] p-3 rounded-lg ${
                          msg.sender_type === 'admin' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted'
                        }`}>
                          {msg.attachment_url && (
                            <div className="mb-1">
                              <VoicePlayer src={msg.attachment_url} />
                            </div>
                          )}
                          {msg.message !== '🎤 Message vocal' && (
                            <p className="text-sm">{msg.message}</p>
                          )}
                          <p className={`text-xs mt-1 ${
                            msg.sender_type === 'admin' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                          }`}>
                            {formatDate(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Reply */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Écrire une réponse..."
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      className="flex-1"
                      rows={2}
                    />
                    <Button 
                      onClick={handleSendReply} 
                      disabled={!replyMessage.trim() || sendReply.isPending}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">ou</span>
                    <div className="flex-1">
                      <VoiceRecorder
                        onSend={handleSendVoiceAdmin}
                        isSending={isSendingVoice}
                        disabled={sendReply.isPending}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
