"use client";

import { RouteError } from "@/components/route-error";

export default function CoachesError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteError title="The coaches roster couldn't be loaded." reset={reset} />;
}
