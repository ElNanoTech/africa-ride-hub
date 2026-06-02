import { useEffect, useRef, useState, useCallback } from 'react';
import { BadgeWithStatus } from '@/hooks/useDriverBadges';
import { triggerConfetti } from '@/hooks/useConfetti';

/**
 * Tracks newly earned badges and queues celebration modals.
 * Compares previous earned badge IDs with current ones to detect new awards.
 */
export function useBadgeCelebration(badges: BadgeWithStatus[]) {
  const [celebrationQueue, setCelebrationQueue] = useState<BadgeWithStatus[]>([]);
  const [currentBadge, setCurrentBadge] = useState<BadgeWithStatus | null>(null);
  const prevEarnedIdsRef = useRef<Set<string> | null>(null);

  // Detect newly earned badges
  useEffect(() => {
    if (badges.length === 0) return;

    const earnedIds = new Set(
      badges.filter((b) => b.earned).map((b) => b.id)
    );

    // Skip first render — just record baseline
    if (prevEarnedIdsRef.current === null) {
      prevEarnedIdsRef.current = earnedIds;
      return;
    }

    const newBadges = badges.filter(
      (b) => b.earned && !prevEarnedIdsRef.current!.has(b.id)
    );

    if (newBadges.length > 0) {
      setCelebrationQueue((q) => [...q, ...newBadges]);
    }

    prevEarnedIdsRef.current = earnedIds;
  }, [badges]);

  // Show next badge from queue
  useEffect(() => {
    if (currentBadge === null && celebrationQueue.length > 0) {
      const [next, ...rest] = celebrationQueue;
      setCurrentBadge(next);
      setCelebrationQueue(rest);
      triggerConfetti();
    }
  }, [currentBadge, celebrationQueue]);

  const dismissCelebration = useCallback(() => {
    setCurrentBadge(null);
  }, []);

  return { currentBadge, dismissCelebration };
}
