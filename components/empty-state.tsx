import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// A written empty state: what would appear here, and one action that creates it.
// Never "No data".
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
      <Icon className="size-8 text-muted-foreground" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
