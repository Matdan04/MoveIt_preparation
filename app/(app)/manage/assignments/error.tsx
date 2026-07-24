"use client";

import { RouteError } from "@/components/route-error";

export default function AssignmentsError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteError title="The assignments board couldn't be loaded." reset={reset} />;
}
