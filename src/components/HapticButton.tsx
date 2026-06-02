import * as React from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

interface HapticButtonProps extends ButtonProps {
  hapticType?: HapticType;
}

const HapticButton = React.forwardRef<HTMLButtonElement, HapticButtonProps>(
  ({ hapticType = 'light', onClick, ...props }, ref) => {
    const haptic = useHapticFeedback();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      haptic.trigger(hapticType);
      onClick?.(e);
    };

    return <Button ref={ref} onClick={handleClick} {...props} />;
  }
);

HapticButton.displayName = "HapticButton";

export { HapticButton };
