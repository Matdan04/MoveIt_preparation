"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Manager-only affordance: pick whose day to view. This is a UX filter — the
// server still scopes and authorizes the read regardless of what is selected.
export function CoachSelect({
  coaches,
  value,
}: {
  coaches: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(next: string) {
    const search = new URLSearchParams(params.toString());
    if (next === "all") search.delete("coach");
    else search.set("coach", next);
    router.push(`/today?${search.toString()}`);
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48" aria-label="Coach">
        <SelectValue placeholder="All coaches" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All coaches</SelectItem>
        {coaches.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
