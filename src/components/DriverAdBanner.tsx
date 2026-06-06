import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, X, ExternalLink } from 'lucide-react';

interface Ad {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
}

/**
 * In-app banner ad rendered on Driver Home.
 * Reads from public.driver_ads (RLS scopes to active + tenant-matching ads).
 * Picks the highest-priority active ad for the `home_banner` placement.
 */
export function DriverAdBanner() {
  const [dismissed, setDismissed] = useState<string | null>(null);

  const { data: ad } = useQuery({
    queryKey: ['driver-ad', 'home_banner'],
    queryFn: async () => {
      const { data } = await supabase
        .from('driver_ads')
        .select('id,title,body,image_url,cta_label,cta_url')
        .eq('placement', 'home_banner')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as Ad) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!ad || dismissed === ad.id) return null;

  const handleCta = async () => {
    if (!ad.cta_url) return;
    window.open(ad.cta_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="px-4 mt-4">
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <button
          onClick={() => setDismissed(ad.id)}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-background/70 hover:bg-background text-muted-foreground"
          aria-label="Fermer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {ad.image_url && (
          <img
            src={ad.image_url}
            alt={ad.title}
            className="w-full h-32 object-cover"
            loading="lazy"
          />
        )}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">{ad.title}</h3>
          </div>
          {ad.body && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{ad.body}</p>
          )}
          {ad.cta_url && (
            <Button size="sm" variant="default" onClick={handleCta} className="w-full">
              {ad.cta_label || 'En savoir plus'}
              <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}