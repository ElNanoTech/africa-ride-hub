import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "bg-muted/60 text-foreground border-border/80",
        // Status badges — increased opacity for readability on all backgrounds
        pending: "border-warning/40 bg-warning/25 text-warning",
        verified: "border-primary/40 bg-primary/25 text-primary",
        approved: "border-primary/40 bg-primary/25 text-primary",
        rejected: "border-destructive/40 bg-destructive/25 text-destructive",
        overdue: "border-destructive/40 bg-destructive/25 text-destructive",
        active: "border-secondary/40 bg-secondary/25 text-secondary",
        paid: "border-success/40 bg-success/25 text-success",
        success: "border-success/40 bg-success/25 text-success",
        // Tier badges
        "tier-a": "border-transparent bg-tier-a text-white",
        "tier-b": "border-transparent bg-tier-b text-white",
        "tier-c": "border-transparent bg-tier-c text-foreground",
        "tier-d": "border-transparent bg-tier-d text-white",
        "tier-e": "border-transparent bg-tier-e text-white",
        // Priority badges
        low: "border-muted/60 bg-muted/60 text-muted-foreground",
        normal: "border-secondary/40 bg-secondary/25 text-secondary",
        high: "border-warning/40 bg-warning/25 text-warning",
        urgent: "border-destructive/40 bg-destructive/25 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
