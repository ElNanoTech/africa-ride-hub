import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

// Route order for determining slide direction
const ROUTE_ORDER = [
  '/driver',
  '/driver/score',
  '/driver/vehicles',
  '/driver/loans',
  '/driver/profile',
];

function getRouteIndex(pathname: string): number {
  // Check for exact match first
  const exactIndex = ROUTE_ORDER.indexOf(pathname);
  if (exactIndex !== -1) return exactIndex;

  // Check for prefix match (for sub-routes)
  for (let i = ROUTE_ORDER.length - 1; i >= 0; i--) {
    if (ROUTE_ORDER[i] !== '/driver' && pathname.startsWith(ROUTE_ORDER[i])) {
      return i;
    }
  }

  // Default to home for unmatched routes under /driver
  if (pathname.startsWith('/driver')) {
    return 0;
  }

  return -1;
}

// Store the previous route to determine animation direction
let previousRouteIndex = -1;

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const location = useLocation();
  const currentIndex = getRouteIndex(location.pathname);
  
  // Determine animation direction based on route order
  const direction = currentIndex > previousRouteIndex ? 1 : -1;
  
  // Update previous index after determining direction
  if (currentIndex !== -1) {
    previousRouteIndex = currentIndex;
  }

  // Animation variants for slide transitions
  const variants = {
    initial: (dir: number) => ({
      x: dir > 0 ? '15%' : '-15%',
      opacity: 0,
    }),
    animate: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? '-15%' : '15%',
      opacity: 0,
    }),
  };

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={location.pathname}
        custom={direction}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{
          type: 'spring',
          stiffness: 380,
          damping: 35,
          mass: 0.8,
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Simpler fade transition for non-tab pages
export function FadeTransition({ children, className }: PageTransitionProps) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{
          duration: 0.2,
          ease: 'easeOut',
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
