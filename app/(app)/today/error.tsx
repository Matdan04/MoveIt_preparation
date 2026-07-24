"use client";

import { RouteError } from "@/components/route-error";

export default function TodayError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError title="Today's sessions couldn't be loaded." reset={reset} />;
}
