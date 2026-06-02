import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  rotation: number;
  size: number;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--tier-a))',
  'hsl(var(--tier-b))',
  'hsl(var(--warning))',
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
];

function generateConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.5,
    rotation: Math.random() * 360,
    size: Math.random() * 8 + 4,
  }));
}

interface ConfettiProps {
  isActive: boolean;
  duration?: number;
  pieceCount?: number;
  onComplete?: () => void;
}

export function Confetti({ 
  isActive, 
  duration = 3000, 
  pieceCount = 50,
  onComplete 
}: ConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isActive) {
      setPieces(generateConfetti(pieceCount));
      setShow(true);

      const timer = setTimeout(() => {
        setShow(false);
        onComplete?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isActive, duration, pieceCount, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
          {pieces.map((piece) => (
            <motion.div
              key={piece.id}
              initial={{
                x: `${piece.x}vw`,
                y: -20,
                rotate: 0,
                opacity: 1,
              }}
              animate={{
                y: '110vh',
                rotate: piece.rotation + 720,
                opacity: [1, 1, 0.8, 0],
              }}
              transition={{
                duration: 2.5 + Math.random(),
                delay: piece.delay,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className="absolute"
              style={{
                width: piece.size,
                height: piece.size * 1.5,
                backgroundColor: piece.color,
                borderRadius: piece.size > 8 ? '2px' : '1px',
              }}
            />
          ))}
          
          {/* Sparkle bursts */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={`sparkle-${i}`}
              initial={{
                x: '50vw',
                y: '30vh',
                scale: 0,
                opacity: 1,
              }}
              animate={{
                x: `${25 + Math.random() * 50}vw`,
                y: `${10 + Math.random() * 40}vh`,
                scale: [0, 1.5, 0],
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 0.8,
                delay: i * 0.1,
                ease: 'easeOut',
              }}
              className="absolute w-3 h-3 rounded-full"
              style={{
                backgroundColor: COLORS[i % COLORS.length],
                boxShadow: `0 0 10px ${COLORS[i % COLORS.length]}`,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
