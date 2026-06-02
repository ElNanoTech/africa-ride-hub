import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BadgeWithStatus, useMarkBadgeSeen } from '@/hooks/useDriverBadges';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Award } from 'lucide-react';

interface BadgeGridProps {
  badges: BadgeWithStatus[];
  isLoading: boolean;
  earnedCount: number;
  totalCount: number;
}

function BadgeItem({ badge }: { badge: BadgeWithStatus }) {
  const [showDetail, setShowDetail] = useState(false);
  const markSeen = useMarkBadgeSeen();

  const handleClick = () => {
    setShowDetail(!showDetail);
    if (badge.earned && !badge.seen && badge.driver_badge_id) {
      markSeen.mutate(badge.driver_badge_id);
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      className={cn(
        "flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-colors relative",
        badge.earned
          ? "bg-primary/5 border border-primary/20"
          : "bg-muted/50 border border-transparent opacity-50"
      )}
      whileTap={{ scale: 0.92 }}
      layout
    >
      {/* Unseen dot */}
      {badge.earned && !badge.seen && (
        <motion.div
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', bounce: 0.6 }}
        />
      )}

      {/* Icon */}
      <span className={cn("text-3xl", !badge.earned && "grayscale")}>
        {badge.icon}
      </span>

      {/* Name */}
      <span className={cn(
        "text-[11px] font-medium leading-tight text-center line-clamp-2",
        badge.earned ? "text-foreground" : "text-muted-foreground"
      )}>
        {badge.name_fr}
      </span>

      {/* Detail popup */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute -bottom-14 left-1/2 -translate-x-1/2 bg-card border border-border rounded-lg px-3 py-2 shadow-lg z-10 whitespace-nowrap"
          >
            <p className="text-xs text-muted-foreground">{badge.description_fr}</p>
            {badge.earned && badge.earned_at && (
              <p className="text-[10px] text-primary mt-0.5">
                Obtenu le {new Date(badge.earned_at).toLocaleDateString('fr-FR')}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function BadgeGrid({ badges, isLoading, earnedCount, totalCount }: BadgeGridProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Badges</CardTitle>
          </div>
          <span className="text-sm text-muted-foreground font-medium">
            {earnedCount}/{totalCount}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-4 gap-2">
          {badges.map((badge) => (
            <BadgeItem key={badge.id} badge={badge} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
