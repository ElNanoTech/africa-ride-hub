import { create } from 'zustand';

interface ConfettiStore {
  isActive: boolean;
  trigger: () => void;
  reset: () => void;
}

// Simple global store for confetti state
export const useConfettiStore = create<ConfettiStore>((set, get) => ({
  isActive: false,
  trigger: () => {
    // Prevent triggering if already active
    if (get().isActive) return;
    
    set({ isActive: true });
    // Auto-reset after animation completes
    setTimeout(() => set({ isActive: false }), 4000);
  },
  reset: () => set({ isActive: false }),
}));

// Standalone function to trigger confetti (not a hook, safe to call anywhere)
export const triggerConfetti = () => {
  useConfettiStore.getState().trigger();
};

// Hook to read confetti state (for the provider)
export function useConfettiState() {
  const isActive = useConfettiStore((state) => state.isActive);
  const reset = useConfettiStore((state) => state.reset);
  return { isActive, reset };
}
