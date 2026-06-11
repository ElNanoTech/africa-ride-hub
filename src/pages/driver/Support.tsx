import { useState } from 'react';
import { Plus, MessageCircle, ChevronRight, Clock, CheckCircle, AlertCircle, User, Send, ArrowLeft } from 'lucide-react';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HapticButton } from '@/components/HapticButton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SUPPORT, UI } from '@/lib/i18n';
import { formatDateShort, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDriverSupportTickets, useCreateSupportTicket, useDriverId, useAddTicketMessage, useUploadVoiceNote } from '@/hooks/useDriverData';
import { useSupportRealtime } from '@/hooks/useDriverRealtimeSubscription';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { VoicePlayer } from '@/components/VoicePlayer';
import { Mic } from 'lucide-react';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketCategory = 'payment' | 'technical' | 'loan' | 'rental' | 'other';

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: 'driver' | 'admin';
  message: string;
  created_at: string;
  attachment_url?: string;
}

interface Ticket {
  id: string;
  ticket_number: string | null;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  messages?: TicketMessage[];
}

const getStatusIcon = (status: TicketStatus) => {
  switch (status) {
    case 'open':
      return <AlertCircle className="h-4 w-4" />;
    case 'in_progress':
      return <Clock className="h-4 w-4" />;
    case 'resolved':
    case 'closed':
      return <CheckCircle className="h-4 w-4" />;
  }
};

const getStatusLabel = (status: TicketStatus) => {
  switch (status) {
    case 'open':
      return SUPPORT.STATUS_OPEN;
    case 'in_progress':
      return SUPPORT.STATUS_IN_PROGRESS;
    case 'resolved':
      return SUPPORT.STATUS_RESOLVED;
    case 'closed':
      return SUPPORT.STATUS_CLOSED;
  }
};

const getStatusVariant = (status: TicketStatus): 'pending' | 'secondary' | 'active' | 'default' => {
  switch (status) {
    case 'open':
      return 'pending';
    case 'in_progress':
      return 'secondary';
    case 'resolved':
    case 'closed':
      return 'active';
    default:
      return 'default';
  }
};

function CreateTicketDialog({ onCreated }: { onCreated: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);

  const createTicket = useCreateSupportTicket();
  const addMessage = useAddTicketMessage();
  const uploadVoice = useUploadVoiceNote();

  const hasVoice = !!voiceBlob;
  const canSubmit =
    !!category &&
    subject.length >= 5 &&
    (hasVoice || description.length >= 10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const reset = () => {
      setIsOpen(false);
      setCategory('');
      setSubject('');
      setDescription('');
      setVoiceBlob(null);
      onCreated();
    };

    try {
      setIsSubmittingVoice(hasVoice);
      const ticket = await createTicket.mutateAsync({
        category,
        subject,
        description: description.trim() || '🎤 Message vocal (voir pièce jointe)',
      });

      if (voiceBlob && ticket?.id) {
        const { signedUrl, storagePath } = await uploadVoice.mutateAsync({
          ticketId: ticket.id,
          audioBlob: voiceBlob,
        });
        await addMessage.mutateAsync({
          ticketId: ticket.id,
          message: '🎤 Message vocal',
          attachmentUrl: signedUrl,
          voiceStoragePath: storagePath,
        });
      }

      reset();
    } catch (err) {
      // toasts already raised by hooks
      console.error('Create ticket with voice failed', err);
    } finally {
      setIsSubmittingVoice(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <HapticButton size="sm" hapticType="medium">
          <Plus className="h-4 w-4 mr-1" />
          {SUPPORT.CREATE_TICKET}
        </HapticButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{SUPPORT.CREATE_TICKET}</DialogTitle>
          <DialogDescription>
            Décrivez votre problème et nous vous répondrons rapidement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category">Catégorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Sélectionnez une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SUPPORT.CATEGORIES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">{SUPPORT.SUBJECT}</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Résumé court du problème"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{SUPPORT.DESCRIPTION}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={hasVoice ? 'Optionnel — vous avez ajouté un message vocal' : 'Décrivez votre problème en détail...'}
              rows={4}
              maxLength={1000}
            />
          </div>

          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <Label className="flex items-center gap-2 text-sm">
              <Mic className="h-4 w-4 text-primary" />
              Message vocal (optionnel)
            </Label>
            <p className="text-xs text-muted-foreground">
              Parlez en français, dioula, bambara ou autre — nous transmettrons votre voix au support.
            </p>
            <VoiceRecorder
              onSend={(blob) => setVoiceBlob(blob)}
              isSending={false}
              disabled={createTicket.isPending || isSubmittingVoice}
            />
            {voiceBlob && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-success">✓ Vocal prêt à envoyer</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setVoiceBlob(null)}
                  className="h-7"
                >
                  Retirer
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setIsOpen(false)}
            >
              {UI.CANCEL}
            </Button>
            <HapticButton
              type="submit"
              className="flex-1"
              disabled={!canSubmit || createTicket.isPending || isSubmittingVoice}
              hapticType="success"
            >
              {createTicket.isPending || isSubmittingVoice ? UI.LOADING : SUPPORT.SUBMIT_TICKET}
            </HapticButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetailDialog({ 
  ticket, 
  isOpen, 
  onClose,
  onMessageSent 
}: { 
  ticket: Ticket; 
  isOpen: boolean; 
  onClose: () => void;
  onMessageSent: () => void;
}) {
  const [newMessage, setNewMessage] = useState('');
  const addMessage = useAddTicketMessage();
  const uploadVoice = useUploadVoiceNote();
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  
  const messages = ticket.messages || [];
  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    addMessage.mutate(
      { ticketId: ticket.id, message: newMessage.trim() },
      {
        onSuccess: () => {
          setNewMessage('');
          onMessageSent();
        },
      }
    );
  };

  const handleSendVoice = async (audioBlob: Blob) => {
    setIsSendingVoice(true);
    try {
      const { signedUrl, storagePath } = await uploadVoice.mutateAsync({ ticketId: ticket.id, audioBlob });
      await addMessage.mutateAsync({
        ticketId: ticket.id,
        message: '🎤 Message vocal',
        attachmentUrl: signedUrl,
        voiceStoragePath: storagePath,
      });
      onMessageSent();
    } finally {
      setIsSendingVoice(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0">
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-muted-foreground">
                  {ticket.ticket_number || ticket.id.slice(0, 8)}
                </span>
                <Badge variant="outline" className="text-xs">
                  {SUPPORT.CATEGORIES[ticket.category as TicketCategory] || ticket.category}
                </Badge>
              </div>
              <h2 className="font-semibold text-lg">{ticket.subject}</h2>
            </div>
            <Badge 
              variant={getStatusVariant(ticket.status as TicketStatus)} 
              className="flex items-center gap-1 flex-shrink-0"
            >
              {getStatusIcon(ticket.status as TicketStatus)}
              {getStatusLabel(ticket.status as TicketStatus)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Créé le {formatDateTime(new Date(ticket.created_at))}
          </p>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            {/* Initial ticket description as first message */}
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  Moi
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Vous</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(new Date(ticket.created_at))}
                  </span>
                </div>
                <div className="bg-primary/5 rounded-lg p-3 text-sm">
                  {ticket.description}
                </div>
              </div>
            </div>

            {/* Conversation messages */}
            {messages.map((message) => {
              const isDriver = message.sender_type === 'driver';
              return (
                <div key={message.id} className="flex gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback 
                      className={cn(
                        "text-xs",
                        isDriver 
                          ? "bg-primary/10 text-primary" 
                          : "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {isDriver ? 'Moi' : 'Sup'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {isDriver ? 'Vous' : 'Support'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(new Date(message.created_at))}
                      </span>
                    </div>
                    <div 
                      className={cn(
                        "rounded-lg p-3 text-sm",
                        isDriver ? "bg-primary/5" : "bg-muted"
                      )}
                    >
                      {message.attachment_url && (
                        <div className="mb-1">
                          <VoicePlayer src={message.attachment_url} />
                        </div>
                      )}
                      {message.message !== '🎤 Message vocal' && message.message}
                      {message.attachment_url && (message as any).transcript_status && (
                        <div className="mt-2 text-xs italic opacity-80 whitespace-pre-wrap">
                          {(message as any).transcript_status === 'ready' && (message as any).transcript}
                          {(message as any).transcript_status === 'processing' && '⏳ Transcription en cours…'}
                          {(message as any).transcript_status === 'pending' && '⏳ Transcription en attente…'}
                          {(message as any).transcript_status === 'failed' && '⚠️ Transcription indisponible'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {messages.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Aucune réponse pour le moment.
                <br />
                Notre équipe vous répondra bientôt.
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Message input */}
        {!isResolved ? (
          <div className="p-4 border-t space-y-2">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Écrivez votre message..."
                className="flex-1"
                disabled={addMessage.isPending || isSendingVoice}
              />
              <HapticButton 
                type="submit" 
                size="icon"
                disabled={!newMessage.trim() || addMessage.isPending}
                hapticType="light"
                className="min-h-[44px] min-w-[44px]"
              >
                <Send className="h-4 w-4" />
              </HapticButton>
            </form>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="flex-1">
                <VoiceRecorder
                  onSend={handleSendVoice}
                  isSending={isSendingVoice}
                  disabled={addMessage.isPending}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 border-t bg-muted/50">
            <p className="text-sm text-muted-foreground text-center">
              Ce ticket est résolu. Créez un nouveau ticket si vous avez besoin d'aide.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NoDriverProfileAlert() {
  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-warning/20 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">Profil conducteur requis</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Vous devez compléter votre inscription en tant que conducteur pour accéder au support.
              Veuillez vous connecter via l'application Yango ou compléter votre profil.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="/driver/profile">Compléter mon profil</a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TicketListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-5 w-3/4" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="h-4 w-full mb-3" />
            <div className="flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function SupportPage() {
  const { data: driverId, isLoading: isDriverIdLoading, isSuccess: isDriverIdSuccess } = useDriverId();
  const { data: tickets = [], isLoading: isTicketsLoading, refetch } = useDriverSupportTickets();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Enable real-time updates
  useSupportRealtime();

  const handleTicketCreated = () => {
    refetch();
  };

  const handleMessageSent = () => {
    refetch();
  };

  const isLoading = isDriverIdLoading || isTicketsLoading;
  const hasDriverProfile = !!driverId;

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: SUPPORT.TITLE }]} />
      <PageHeader 
        title={SUPPORT.TITLE}
        action={hasDriverProfile ? <CreateTicketDialog onCreated={handleTicketCreated} /> : undefined}
      />

      <div className="px-4 pb-6">
        {/* No Driver Profile Alert */}
        {isDriverIdSuccess && driverId === null && (
          <div className="mb-6">
            <NoDriverProfileAlert />
          </div>
        )}

        {/* Quick Help */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              Besoin d'aide ?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Questions fréquentes :
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">Paiement</Button>
              <Button variant="outline" size="sm">Score</Button>
              <Button variant="outline" size="sm">Location</Button>
              <Button variant="outline" size="sm">Prêt</Button>
            </div>
          </CardContent>
        </Card>

        {/* My Tickets */}
        {hasDriverProfile && (
          <>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                {SUPPORT.MY_TICKETS}
              </h2>
            </div>

            {isLoading ? (
              <TicketListSkeleton />
            ) : tickets.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">{SUPPORT.NO_TICKETS}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <Card 
                    key={ticket.id} 
                    className="overflow-hidden cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setSelectedTicket(ticket as Ticket)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-muted-foreground">
                              {ticket.ticket_number || ticket.id.slice(0, 8)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {SUPPORT.CATEGORIES[ticket.category as TicketCategory] || ticket.category}
                            </Badge>
                          </div>
                          <h3 className="font-medium truncate">{ticket.subject}</h3>
                        </div>
                        <Badge variant={getStatusVariant(ticket.status as TicketStatus)} className="flex items-center gap-1 flex-shrink-0">
                          {getStatusIcon(ticket.status as TicketStatus)}
                          {getStatusLabel(ticket.status as TicketStatus)}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {ticket.description}
                      </p>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Créé le {formatDateShort(new Date(ticket.created_at))}
                        </span>
                        <Button variant="ghost" size="sm" className="text-primary -mr-2">
                          Voir
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Ticket Detail Dialog */}
      {selectedTicket && (
        <TicketDetailDialog
          ticket={selectedTicket}
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onMessageSent={handleMessageSent}
        />
      )}
    </DriverLayout>
  );
}
