import { useEffect, useMemo, useState } from "react";
import { Check, X, Search, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { INVOICE_TAGS } from "@/types/billing";

interface InvoiceTagPickerProps {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Searchable multi-select picker for invoice tags.
 * Staged-selection model: dropdown toggles a local `pending` set; persistence
 * happens only when the user clicks OK. Annuler / outside-click / Escape
 * discard pending changes. The chip-strip above the trigger reflects the
 * saved `value` (source of truth); the per-chip X still removes immediately.
 */
export function InvoiceTagPicker({
  value,
  onChange,
  disabled = false,
  className,
}: InvoiceTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string[]>(value);

  // Re-seed pending from saved value on each open transition (closed -> open).
  // Intentionally NOT depending on `value` to avoid clobbering in-progress edits.
  useEffect(() => {
    if (open) {
      setPending(value);
      setSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return INVOICE_TAGS;
    return INVOICE_TAGS.filter((t) => t.toLowerCase().includes(q));
  }, [search]);

  const togglePending = (tag: string) => {
    setPending((p) => (p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]));
  };

  const commit = () => {
    onChange(pending);
    setOpen(false);
  };

  const cancel = () => {
    setOpen(false);
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            Aucun tag sélectionné
          </span>
        )}
        {value.filter(Boolean).map((tag) => (
          <Badge
            key={String(tag)}
            variant="outline"
            className="gap-1 pr-1 text-xs max-w-[180px]"
          >
            <span className="truncate">{String(tag)}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(String(tag))}
                className="rounded-sm hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Retirer ${String(tag)}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ajouter un tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Rechercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-7 text-sm"
                />
              </div>
            </div>
            <p className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground">
              Cliquez pour sélectionner. Validez avec OK pour enregistrer.
            </p>
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Aucun tag trouvé
                </p>
              ) : (
                filtered.map((tag) => {
                  const selected = pending.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      role="option"
                      aria-selected={selected}
                      onClick={() => togglePending(tag)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-accent",
                        selected
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>{tag}</span>
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          selected ? "text-primary opacity-100" : "opacity-0",
                        )}
                      />
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-2 border-t p-2">
              <Button type="button" size="sm" variant="ghost" onClick={cancel}>
                Annuler
              </Button>
              <Button type="button" size="sm" onClick={commit}>
                OK
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
