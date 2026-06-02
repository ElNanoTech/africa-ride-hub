import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/routeClient';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_QUESTIONS = [
  '📊 Comment améliorer mon score?',
  '💰 Mes paiements en attente?',
  '🚗 Ma location en cours?',
  '📈 Conseils pour gagner plus',
];

export function AIChatbot({ driverId }: { driverId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim() };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    try {
      const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-driver-chatbot`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ driverId, messages: apiMessages }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Erreur réseau' }));
        setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: err.error || 'Une erreur est survenue.' } : m));
        setIsStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulated += delta;
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMsg.id ? { ...m, content: accumulated } : m
                  ));
                }
              } catch { /* skip malformed chunks */ }
            }
          }
        }
      }

      if (!accumulated) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: 'Désolé, je n\'ai pas pu répondre. Réessayez.' } : m
        ));
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, content: 'Erreur de connexion. Vérifiez votre réseau.' } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-24 left-4 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          >
            <Sparkles className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[60] flex flex-col bg-background"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Assistant DAM</h3>
                  <p className="text-[10px] text-muted-foreground">IA Premium • Répond en temps réel</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">Bonjour! 👋</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Je suis votre assistant IA personnel. Posez-moi vos questions!
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTED_QUESTIONS.map(q => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="text-xs px-3 py-2 rounded-full bg-muted hover:bg-muted/80 transition-colors text-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  )}>
                    {msg.role === 'assistant' && !msg.content && isStreaming ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Réflexion...</span>
                      </div>
                    ) : msg.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none [&>p]:mb-1 [&>p:last-child]:mb-0">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span>{msg.content}</span>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5 text-secondary" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border bg-card p-3 safe-bottom">
              <form
                onSubmit={e => { e.preventDefault(); sendMessage(input); }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Posez votre question..."
                  disabled={isStreaming}
                  className="flex-1 bg-muted rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground disabled:opacity-50"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || isStreaming}
                  className="rounded-full w-10 h-10 flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
