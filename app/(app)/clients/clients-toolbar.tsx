"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The sentinel Radix uses for "no filter" — Select cannot hold an empty-string
// value, so "all" stands in and is stripped from the URL when chosen.
const ALL = "all";

// The toolbar owns nothing but the URL. It reads the current filter state from
// the query string and writes back to it; the server re-reads searchParams and
// re-filters. No client-side data fetching, no local copy of the roster.
export function ClientsToolbar({
  coaches,
  q,
  coach,
  status,
}: {
  coaches: string[];
  q: string;
  coach: string;
  status: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Local mirror of the search box so typing stays responsive; the URL is
  // updated on a debounce rather than on every keystroke.
  const [term, setTerm] = useState(q);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function commit(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value === "" || value === ALL) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  function onSearchChange(value: string) {
    setTerm(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => commit({ q: value }), 250);
  }

  useEffect(() => () => clearTimeout(debounce.current), []);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative sm:max-w-xs sm:flex-1">
        {isPending ? (
          <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          type="search"
          placeholder="Search by name…"
          value={term}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8"
          aria-label="Search clients by name"
        />
      </div>

      <Select
        value={coach || ALL}
        onValueChange={(value) => commit({ coach: value })}
      >
        <SelectTrigger className="sm:w-48" aria-label="Filter by coach">
          <SelectValue placeholder="Coach" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All coaches</SelectItem>
          {coaches.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status || ALL}
        onValueChange={(value) => commit({ status: value })}
      >
        <SelectTrigger className="sm:w-40" aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="INACTIVE">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
