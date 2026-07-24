"use client";

import { RouteError } from "@/components/route-error";

export default function ClientsError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError title="The clients couldn't be loaded." reset={reset} />;
}
