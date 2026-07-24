"use client";

import { Button } from "@/components/ui/button";

// The shared body of every route's error.tsx. States what failed and offers a
// retry — the interface's voice, never an apology and never a stack trace. Each
// route re-exports this from its own error.tsx (which must be a client
// component) so the boundary is per-route while the copy stays in one place.
export function RouteError({
  title,
  reset,
}: {
  title: string;
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        The data didn&apos;t load. This is usually temporary.
      </p>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
