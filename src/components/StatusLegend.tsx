import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getLegend, type BadgeVariant, type StatusKind } from "@/lib/statusBadges";

export interface LegendItem {
  label: string;
  meaning: string;
  variant?: BadgeVariant;
  className?: string;
}

interface StatusLegendProps {
  title?: string;
  /** Provide a registry kind to auto-build the legend from the central mapping. */
  kind?: StatusKind | StatusKind[];
  /** Or pass explicit items (back-compat). */
  items?: LegendItem[];
  defaultOpen?: boolean;
}

/**
 * Compact, collapsible legend describing badge meanings.
 * Prefer passing `kind` so all screens share the central mapping
 * (`src/lib/statusBadges.tsx`). Tooltips repeat the meaning for keyboard users.
 */
export function StatusLegend({ title = "Légende des statuts", kind, items, defaultOpen = false }: StatusLegendProps) {
  const [open, setOpen] = useState(defaultOpen);

  const resolved: LegendItem[] = items
    ? items
    : kind
    ? (Array.isArray(kind) ? kind : [kind]).flatMap((k) =>
        getLegend(k).map((m) => ({ label: m.label, meaning: m.meaning, variant: m.variant })),
      )
    : [];

  return (
    <Card className="mb-4">
      <CardContent className="p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="h-8 px-2 gap-2 text-muted-foreground hover:text-foreground"
        >
          <Info className="h-4 w-4" />
          <span className="text-sm">{title}</span>
          <span className="text-xs">{open ? "▲" : "▼"}</span>
        </Button>
        {open && (
          <TooltipProvider delayDuration={200}>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {resolved.map((it, idx) => (
                <li key={`${it.label}-${idx}`} className="flex items-start gap-2 text-sm">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Badge variant={it.variant ?? "outline"} className={it.className}>
                          {it.label}
                        </Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{it.meaning}</TooltipContent>
                  </Tooltip>
                  <span className="text-muted-foreground">{it.meaning}</span>
                </li>
              ))}
            </ul>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
