import { useMemo, useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { getTierFromScore, scoreToPercentage } from '@/lib/format';
import { SCORE, TIER_INFO } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';

interface ScoreGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showTier?: boolean;
  status?: 'provisional' | 'active';
  className?: string;
  animate?: boolean;
  scoreChange?: number;
  tierUpgraded?: boolean;
}

function useAnimatedNumber(target: number, duration = 1200, animate = true) {
  const [value, setValue] = useState(animate ? 0 : target);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!animate) { setValue(target); return; }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, animate]);

  return value;
}

export function ScoreGauge({
  score,
  size = 'md',
  showTier = true,
  status = 'active',
  className,
  animate = true,
  scoreChange = 0,
  tierUpgraded = false,
}: ScoreGaugeProps) {
  const tier = getTierFromScore(score);
  const percentage = scoreToPercentage(score);
  const displayScore = useAnimatedNumber(score, 1400, animate);

  const dimensions = {
    sm: { size: 120, stroke: 8, fontSize: 'text-2xl', tierSize: 'text-xs' },
    md: { size: 180, stroke: 10, fontSize: 'text-4xl', tierSize: 'text-sm' },
    lg: { size: 240, stroke: 12, fontSize: 'text-5xl', tierSize: 'text-base' },
  };

  const { size: svgSize, stroke, fontSize, tierSize } = dimensions[size];
  const radius = (svgSize - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const tierColors: Record<string, string> = {
    A: 'stroke-tier-a',
    B: 'stroke-tier-b',
    C: 'stroke-tier-c',
    D: 'stroke-tier-d',
    E: 'stroke-tier-e',
  };

  const tierGlowColors: Record<string, string> = {
    A: 'hsl(var(--tier-a))',
    B: 'hsl(var(--tier-b))',
    C: 'hsl(var(--tier-c))',
    D: 'hsl(var(--tier-d))',
    E: 'hsl(var(--tier-e))',
  };

  const tierBgColors: Record<string, string> = {
    A: 'bg-tier-a',
    B: 'bg-tier-b',
    C: 'bg-tier-c text-foreground',
    D: 'bg-tier-d',
    E: 'bg-tier-e',
  };

  const showPulseGlow = scoreChange > 0;
  const glowColor = tierGlowColors[tier] || tierGlowColors.E;

  return (
    <div className={cn('score-gauge relative', className)}>
      {/* Pulse glow ring behind gauge on score increase */}
      <AnimatePresence>
        {showPulseGlow && (
          <motion.div
            className="absolute inset-0 rounded-full"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0, 0.6, 0],
              scale: [0.85, 1.15, 1.25],
            }}
            transition={{ duration: 2, repeat: 2, ease: 'easeOut' }}
            style={{
              boxShadow: `0 0 40px 15px ${glowColor}`,
              borderRadius: '50%',
              width: svgSize,
              height: svgSize,
            }}
          />
        )}
      </AnimatePresence>

      <svg
        width={svgSize}
        height={svgSize}
        className="score-gauge-circle"
      >
        {/* Glow filter */}
        <defs>
          <filter id="score-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Background track */}
        <circle
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={radius}
          className="score-gauge-track"
          strokeWidth={stroke}
        />
        {/* Score value arc with animated entry */}
        <circle
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={radius}
          className={cn('score-gauge-value', tierColors[tier])}
          strokeWidth={stroke + (showPulseGlow ? 2 : 0)}
          strokeDasharray={circumference}
          strokeDashoffset={animate ? circumference : offset}
          filter={showPulseGlow ? 'url(#score-glow)' : undefined}
          style={{
            strokeDashoffset: offset,
            transition: animate ? 'stroke-dashoffset 1.4s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute flex flex-col items-center justify-center">
        <motion.span
          className={cn('font-bold tabular-nums', fontSize)}
          initial={animate ? { scale: 0.5, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5, type: 'spring', stiffness: 200 }}
        >
          {displayScore}
        </motion.span>
        {showTier && (
          <motion.div
            className="flex flex-col items-center gap-1 mt-1"
            initial={animate ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.4 }}
          >
            <motion.span
              className={cn(
                'px-2 py-0.5 rounded-full text-white font-semibold',
                tierSize,
                tierBgColors[tier]
              )}
              animate={tierUpgraded ? {
                scale: [1, 1.3, 1],
                rotate: [0, -5, 5, 0],
              } : {}}
              transition={{ duration: 0.6, delay: 1.2 }}
            >
              Niveau {tier}
            </motion.span>
            <span className="text-xs text-muted-foreground">
              {status === 'provisional' ? SCORE.PROVISIONAL : SCORE.ACTIVE}
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
}

interface ScoreChangeIndicatorProps {
  change: number;
  className?: string;
}

export function ScoreChangeIndicator({ change, className }: ScoreChangeIndicatorProps) {
  if (change === 0) return null;

  const isPositive = change > 0;
  
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm font-medium',
        isPositive ? 'text-primary' : 'text-destructive',
        className
      )}
    >
      {isPositive ? '+' : ''}{change} {SCORE.POINTS}
    </span>
  );
}

interface TierBadgeProps {
  tier: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function TierBadge({ tier, showLabel = true, size = 'md', className }: TierBadgeProps) {
  const tierInfo = TIER_INFO[tier as keyof typeof TIER_INFO];
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  const tierBgColors: Record<string, string> = {
    A: 'bg-tier-a text-white',
    B: 'bg-tier-b text-white',
    C: 'bg-tier-c text-foreground',
    D: 'bg-tier-d text-white',
    E: 'bg-tier-e text-white',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold',
        sizeClasses[size],
        tierBgColors[tier],
        className
      )}
    >
      {tier}
      {showLabel && tierInfo && (
        <span className="font-normal opacity-90">· {tierInfo.label}</span>
      )}
    </span>
  );
}
