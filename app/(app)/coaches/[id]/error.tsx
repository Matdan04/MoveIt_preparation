"use client";

import { RouteError } from "@/components/route-error";

export default function CoachDetailError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteError title="This coach couldn't be loaded." reset={reset} />;
}
