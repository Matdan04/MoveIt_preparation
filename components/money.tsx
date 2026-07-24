import { cn } from "@/lib/utils";

// Money is stored as integer sen everywhere; this is the single place it
// becomes a ringgit string. Mono + tabular so columns of prices align.
const formatter = new Intl.NumberFormat("en-MY", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function Money({ sen, className }: { sen: number; className?: string }) {
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      RM {formatter.format(sen / 100)}
    </span>
  );
}
