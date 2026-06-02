import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BadgeWithStatus } from '@/hooks/useDriverBadges';

interface BadgeCelebrationModalProps {
  badge: BadgeWithStatus | null;
  open: boolean;
  onClose: () => void;
}

export function BadgeCelebrationModal({ badge, open, onClose }: BadgeCelebrationModalProps) {
  if (!badge) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xs mx-auto rounded-2xl text-center">
        <DialogHeader className="items-center gap-2">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
            className="text-7xl mb-2"
          >
            {badge.icon}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">
              🎉 Nouveau badge obtenu!
            </p>
            <DialogTitle className="text-xl mt-1">{badge.name_fr}</DialogTitle>
            <DialogDescription className="mt-2 text-sm">
              {badge.description_fr}
            </DialogDescription>
          </motion.div>
        </DialogHeader>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Button onClick={onClose} className="w-full mt-2 rounded-xl">
            Super! 🙌
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
