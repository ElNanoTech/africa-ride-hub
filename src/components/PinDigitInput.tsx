import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface PinDigitInputProps {
  value: string;
  onChange: (pin: string) => void;
  length?: number;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Plain 4-digit PIN input with fully isolated local state.
 * Only bubbles the final string up via onChange — never causes the parent
 * to re-render with stale values mid-typing.
 */
export function PinDigitInput({
  value,
  onChange,
  length = 4,
  className,
  autoFocus,
}: PinDigitInputProps) {
  const [digits, setDigits] = useState<string[]>(() => {
    const init = Array.from({ length }, (_, i) => value[i] ?? '');
    return init;
  });
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Sync from parent only when the parent value changes externally
  // (e.g. reset to ''). Avoid resetting on every parent re-render.
  useEffect(() => {
    const joined = digits.join('');
    if (value !== joined) {
      setDigits(Array.from({ length }, (_, i) => value[i] ?? ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length]);

  const emit = useCallback(
    (next: string[]) => {
      onChange(next.join(''));
    },
    [onChange]
  );

  const handleChange = (idx: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = digit;
      emit(next);
      return next;
    });
    if (digit && idx < length - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        // Clear current
        setDigits((prev) => {
          const next = [...prev];
          next[idx] = '';
          emit(next);
          return next;
        });
      } else if (idx > 0) {
        // Move back and clear previous
        inputsRef.current[idx - 1]?.focus();
        setDigits((prev) => {
          const next = [...prev];
          next[idx - 1] = '';
          emit(next);
          return next;
        });
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      inputsRef.current[idx + 1]?.focus();
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    const next = Array.from({ length }, (_, i) => pasted[i] ?? '');
    setDigits(next);
    emit(next);
    const lastFilled = Math.min(pasted.length, length) - 1;
    inputsRef.current[lastFilled]?.focus();
  };

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (inputsRef.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus={autoFocus && i === 0}
          className={cn(
            'h-12 w-12 rounded-md border border-input bg-background text-center text-lg font-semibold',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
            'transition-all'
          )}
          aria-label={`Chiffre ${i + 1}`}
        />
      ))}
    </div>
  );
}
