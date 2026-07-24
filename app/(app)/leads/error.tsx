"use client";

import { RouteError } from "@/components/route-error";

export default function LeadsError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError title="The leads couldn't be loaded." reset={reset} />;
}
