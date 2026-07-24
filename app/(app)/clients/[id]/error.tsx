"use client";

import { RouteError } from "@/components/route-error";

export default function ClientDetailError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteError title="This client couldn't be loaded." reset={reset} />;
}
