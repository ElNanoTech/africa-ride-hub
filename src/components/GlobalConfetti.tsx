import { Confetti } from '@/components/Confetti';
import { useConfettiState } from '@/hooks/useConfetti';

export function GlobalConfetti() {
  const { isActive, reset } = useConfettiState();
  
  return (
    <Confetti 
      isActive={isActive} 
      pieceCount={80}
      duration={4000}
      onComplete={reset}
    />
  );
}
