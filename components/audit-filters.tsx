"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

// A sentinel for the "all" option — radix Select cannot hold an empty-string
// value, so clearing a facet means removing the param entirely.
const ALL = "__all__";

export function AuditFilters({
  entityTypes,
  actions,
}: {
  entityTypes: string[];
  actions: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const entityType = params.get("entityType") ?? "";
  const action = params.get("action") ?? "";
  const active = entityType || action;

  // Updating a filter is navigation, not data fetching: it rewrites the query
  // string and the server component re-reads the scoped log for the new params.
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    router.push(`/manage/audit?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={entityType || ALL}
        onValueChange={(v) => setParam("entityType", v)}
      >
        <SelectTrigger className="w-48" size="sm">
          <SelectValue placeholder="All entities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All entities</SelectItem>
          {entityTypes.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={action || ALL}
        onValueChange={(v) => setParam("action", v)}
      >
        <SelectTrigger className="w-56" size="sm">
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All actions</SelectItem>
          {actions.map((a) => (
            <SelectItem key={a} value={a} className="font-mono text-xs">
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/manage/audit")}
        >
          <X className="size-4" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
