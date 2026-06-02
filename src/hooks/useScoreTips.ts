import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverId } from './useDriverData';

interface ScoreTip {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'driving' | 'payment' | 'income';
}

interface ScoreTipsResponse {
  tips: ScoreTip[];
  encouragement: string;
}

export function useScoreTips(creditScoreId: string | undefined) {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['scoreTips', creditScoreId],
    queryFn: async (): Promise<ScoreTipsResponse> => {
      if (!creditScoreId || !driverId) {
        throw new Error('Missing creditScoreId or driverId');
      }

      // First check for cached tips
      const { data: existing, error: fetchError } = await supabase
        .from('ai_explanations')
        .select('content')
        .eq('credit_score_id', creditScoreId)
        .eq('driver_id', driverId)
        .eq('explanation_type', 'tips')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      
      if (existing?.content) {
        try {
          return JSON.parse(existing.content as string);
        } catch {
          // If parsing fails, regenerate
        }
      }

      // Generate new tips via edge function
      const { data, error } = await supabase.functions.invoke(
        'generate-score-tips',
        { body: { creditScoreId, driverId } }
      );

      if (error) {
        console.error('Error generating tips:', error);
        // Return fallback tips
        return {
          tips: [
            {
              title: 'Conduisez prudemment',
              description: 'Évitez les freinages brusques et respectez les limites de vitesse.',
              priority: 'high',
              category: 'driving',
            },
            {
              title: 'Payez à temps',
              description: 'Effectuez vos paiements avant la date limite.',
              priority: 'high',
              category: 'payment',
            },
          ],
          encouragement: 'Continuez vos efforts!',
        };
      }

      return data;
    },
    enabled: !!creditScoreId && !!driverId,
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
    retry: 1,
  });
}
