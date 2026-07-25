"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AuditEntryRow } from "@/lib/data/audit";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Time } from "@/components/time";
import { cn } from "@/lib/utils";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// A field-level view of what the mutation changed. For an update we walk the
// union of both snapshots and keep only the keys whose value moved; for a
// create (no before) or delete (no after) every field is shown as a set/clear.
function diffFields(before: JsonRecord | null, after: JsonRecord | null) {
  const keys = new Set([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ]);
  const rows: { key: string; from: unknown; to: unknown }[] = [];
  for (const key of [...keys].sort()) {
    const from = before?.[key];
    const to = after?.[key];
    const changed = JSON.stringify(from) !== JSON.stringify(to);
    if (before && after && !changed) continue;
    rows.push({ key, from, to });
  }
  return rows;
}

export function AuditEntryRow({ entry }: { entry: AuditEntryRow }) {
  const [open, setOpen] = useState(false);
  const before = asRecord(entry.before);
  const after = asRecord(entry.after);
  const rows = diffFields(before, after);

  return (
    <>
      <TableRow
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="cursor-pointer"
      >
        <TableCell className="w-8 text-muted-foreground">
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              open && "rotate-90",
            )}
          />
        </TableCell>
        <TableCell>
          <Time value={entry.createdAt} className="text-muted-foreground" />
        </TableCell>
        <TableCell className="font-medium">{entry.actor.name}</TableCell>
        <TableCell>
          <Badge variant="outline" className="font-mono text-xs">
            {entry.action}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {entry.entityType}
        </TableCell>
      </TableRow>

      {open ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="bg-muted/30 whitespace-normal">
            {rows.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No field-level snapshot recorded for this entry.
              </p>
            ) : (
              <div className="overflow-x-auto px-2 py-3">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="pb-2 pr-4 font-medium">Field</th>
                      <th className="pb-2 pr-4 font-medium">Before</th>
                      <th className="pb-2 font-medium">After</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono align-top">
                    {rows.map((r) => (
                      <tr key={r.key} className="border-t border-border/60">
                        <td className="py-1.5 pr-4 font-medium">{r.key}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">
                          {formatValue(r.from)}
                        </td>
                        <td className="py-1.5 text-foreground">
                          {formatValue(r.to)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
