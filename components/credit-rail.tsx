"use client";

// The signature element. The project's central invariant is that a credit
// balance is DERIVED by summing an append-only ledger, never stored — this
// component is that invariant made visible. It renders one tick per granted
// credit straight from CreditLedgerEntry rows and refuses, by construction, to
// take a precomputed balance number. If you find yourself wanting to pass it a
// `balance` prop, the rest of the app has already gone wrong.
//
// Consumed, remaining, manually adjusted (notched, warning) and reversed
// (struck, followed by a restored empty tick) each render distinctly, so a
// manager reading the rail can see not just how many credits are left but the
// shape of the history that produced that number.
//
// Interactive, so it is a client component. Dates are NOT formatted here —
// callers pass server-formatted labels (Asia/Kuala_Lumpur) on each entry;
// formatting in the browser is the timezone bug the README warns about.

import * as React from "react";
import type { TrainingSessionStatus } from "@prisma/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Reason conventions owned by lib/services/credits.ts. Kept in sync by hand:
// the ledger is the contract between the service and this view.
const GRANT_REASON = "package:GRANT";
const SETTLEMENT_PREFIX = "session:";

// A ledger row, enriched by the server with the human-facing labels a tooltip
// needs. The raw CreditLedgerEntry shape is a subset of this; callers add the
// joined actor name and the pre-formatted dates.
export type RailEntry = {
  id: string;
  delta: number;
  reason: string;
  trainingSessionId: string | null;
  // Ordering only — never formatted for display in this component.
  createdAt: Date | string;
  // Server-formatted (KL) timestamp of the entry, shown in the tooltip.
  dateLabel: string;
  actorName?: string;
  sessionStatus?: TrainingSessionStatus | null;
  // Server-formatted (KL) time of the linked session, when there is one.
  sessionLabel?: string;
};

// Five visual states, each a distinct mark:
//   remaining  — a granted credit not yet spent (empty)
//   consumed   — spent by a session outcome (filled, ink)
//   adjusted   — a manager's manual movement (notched, warning); filled if it
//                spent a credit, hollow if it granted one
//   reversed   — a consumption that was later undone (struck through)
//   restored   — the empty tick a reversal gives back, shown beside the strike
type TickState =
  | "remaining"
  | "consumed"
  | "adjusted"
  | "reversed"
  | "restored";

type Tick = {
  state: TickState;
  // Whether the mark reads as filled (a spent credit) or hollow (available).
  filled: boolean;
  // The entry that produced this mark, if any; remaining ticks have none.
  entry?: RailEntry;
};

type DerivedRail = {
  ticks: Tick[];
  granted: number;
  // Sum of every delta — the live balance, derived, never stored.
  balance: number;
  used: number;
};

// The whole logic of the component: turn an unordered ledger into an ordered
// run of ticks. Pure and exported so it can be reasoned about (and tested)
// without rendering.
export function deriveRail(entries: RailEntry[]): DerivedRail {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const granted = sorted
    .filter((e) => e.reason === GRANT_REASON)
    .reduce((sum, e) => sum + e.delta, 0);

  // Seed one hollow slot per granted credit; consumption fills from the left.
  const ticks: Tick[] = Array.from({ length: Math.max(granted, 0) }, () => ({
    state: "remaining" as const,
    filled: false,
  }));

  const firstRemaining = () => ticks.findIndex((t) => t.state === "remaining");

  for (const e of sorted) {
    if (e.reason === GRANT_REASON) continue;

    const isSettlement = e.reason.startsWith(SETTLEMENT_PREFIX);
    // A reversal copies the original's trainingSessionId and posts the inverse
    // delta (see reverseEntry); a manual adjustment never carries a session.
    // That difference — not a flag we don't have — is how we tell them apart.
    const isReversal =
      !isSettlement && e.delta > 0 && e.trainingSessionId !== null;

    if (isSettlement) {
      if (e.delta === 0) continue; // studio/early cancel: no credit moved, no tick
      const idx = firstRemaining();
      const tick: Tick = { state: "consumed", filled: true, entry: e };
      if (idx >= 0) ticks[idx] = tick;
      else ticks.push(tick);
      continue;
    }

    if (isReversal) {
      // Strike the consumption this undoes and hand back an empty tick right
      // after it, so the correction is shown, never rewritten.
      const target = ticks.findIndex(
        (t) =>
          t.state === "consumed" &&
          t.entry?.trainingSessionId === e.trainingSessionId,
      );
      if (target >= 0) {
        ticks[target] = { ...ticks[target], state: "reversed" };
        ticks.splice(target + 1, 0, {
          state: "restored",
          filled: false,
          entry: e,
        });
      } else {
        ticks.push({ state: "restored", filled: false, entry: e });
      }
      continue;
    }

    // Manual adjustment. A negative delta spends a credit (filled notch); a
    // positive one grants an extra (hollow notch appended to the run).
    if (e.delta < 0) {
      const idx = firstRemaining();
      const tick: Tick = { state: "adjusted", filled: true, entry: e };
      if (idx >= 0) ticks[idx] = tick;
      else ticks.push(tick);
    } else {
      ticks.push({ state: "adjusted", filled: false, entry: e });
    }
  }

  const balance = sorted.reduce((sum, e) => sum + e.delta, 0);
  return { ticks, granted, balance, used: granted - balance };
}

function reasonLabel(entry: RailEntry): string {
  if (entry.reason === GRANT_REASON) return "Opening grant";
  if (entry.reason.startsWith(SETTLEMENT_PREFIX)) {
    const status = entry.reason.slice(SETTLEMENT_PREFIX.length);
    switch (status) {
      case "ATTENDED":
        return "Attended session";
      case "NO_SHOW":
        return "No-show";
      case "CANCELLED_BY_CLIENT":
        return "Late cancellation";
      default:
        return "Session outcome";
    }
  }
  return entry.reason; // manual adjustment / reversal reason, as written
}

// Warning-coloured trailing ticks below this many remaining credits.
const LOW_THRESHOLD = 3;

const stateBar: Record<TickState, string> = {
  remaining: "bg-transparent",
  consumed: "bg-foreground",
  adjusted: "bg-warning",
  reversed: "bg-muted-foreground/40",
  restored: "bg-transparent",
};

function Mark({
  tick,
  low,
  compact,
}: {
  tick: Tick;
  low: boolean;
  compact: boolean;
}) {
  const isEmpty = !tick.filled;
  // Hollow marks read as an outline; the trailing empties turn warning when the
  // package is running low, which is the one time an empty tick carries meaning.
  const emptyTone = low ? "border-warning bg-warning/10" : "border-border";

  return (
    <span
      aria-hidden
      className={cn(
        "relative block rounded-[2px]",
        compact ? "h-3.5 w-[3px]" : "h-6 w-[7px]",
        isEmpty
          ? cn("border", emptyTone)
          : cn(
              stateBar[tick.state],
              // A notch cut into adjusted marks — visibly not ordinary use.
              tick.state === "adjusted" &&
                "after:absolute after:inset-x-0 after:top-1/2 after:h-[2px] after:-translate-y-1/2 after:bg-warning-foreground/70 after:content-['']",
            ),
        // The strike on a reversed consumption: a diagonal rule across the mark.
        tick.state === "reversed" &&
          "before:absolute before:left-1/2 before:top-1/2 before:h-[140%] before:w-[1.5px] before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:bg-danger before:content-['']",
      )}
    />
  );
}

function TickDetail({ entry }: { entry: RailEntry }) {
  return (
    <div className="space-y-1">
      <p className="text-[13px] font-medium">{reasonLabel(entry)}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {entry.sessionLabel ? (
          <>
            <dt>Session</dt>
            <dd className="font-mono text-foreground">{entry.sessionLabel}</dd>
          </>
        ) : null}
        <dt>Recorded</dt>
        <dd className="font-mono text-foreground">{entry.dateLabel}</dd>
        {entry.actorName ? (
          <>
            <dt>By</dt>
            <dd className="text-foreground">{entry.actorName}</dd>
          </>
        ) : null}
        <dt>Change</dt>
        <dd className="font-mono text-foreground">
          {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
        </dd>
      </dl>
    </div>
  );
}

// An interactive tick: hover reveals a one-line summary (tooltip), click/tap
// pins the full entry (popover). Only marks backed by an entry are interactive;
// plain remaining slots are inert.
function InteractiveMark({
  tick,
  low,
  compact,
}: {
  tick: Tick;
  low: boolean;
  compact: boolean;
}) {
  if (!tick.entry) return <Mark tick={tick} low={low} compact={compact} />;

  const entry = tick.entry;
  const summary = `${reasonLabel(entry)} · ${entry.dateLabel}`;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={summary}
              className="rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Mark tick={tick} low={low} compact={compact} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{summary}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64">
        <TickDetail entry={entry} />
      </PopoverContent>
    </Popover>
  );
}

export function CreditRail({
  entries,
  expiresLabel,
  variant = "full",
  className,
}: {
  entries: RailEntry[];
  // Server-formatted (KL) expiry date for the caption; omitted when irrelevant.
  expiresLabel?: string;
  variant?: "full" | "compact";
  className?: string;
}) {
  const { ticks, granted, balance, used } = React.useMemo(
    () => deriveRail(entries),
    [entries],
  );

  // "Low" marks the trailing empties once the balance dips under the threshold.
  // Track how many remaining/restored slots we've seen from the right so only
  // the last few light up, matching the caption's warning.
  const low = balance > 0 && balance < LOW_THRESHOLD;
  let hollowFromRight = 0;
  const lowFlags = [...ticks].reverse().map((t) => {
    const isHollow = t.state === "remaining" || t.state === "restored";
    if (!isHollow) return false;
    hollowFromRight += 1;
    return low && hollowFromRight <= balance;
  });
  lowFlags.reverse();

  if (variant === "compact") {
    // Table-row variant: never wraps, so at 375px with a 24-credit package the
    // 3px marks simply pack tight rather than shrinking tap targets — the
    // compact rail is a glanceable summary, not a control, so the detail lives
    // on the full rail on the client page. One tooltip summarises the whole run.
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn("inline-flex items-center gap-2", className)}
              aria-label={`${used} of ${granted} credits used`}
            >
              <span className="flex items-center gap-[2px]">
                {ticks.map((t, i) => (
                  <Mark key={i} tick={t} low={lowFlags[i]} compact />
                ))}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {balance}/{granted}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {used} of {granted} used · {balance} remaining
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("space-y-2", className)}>
        {/* Wraps rather than shrinks: at 375px a 24-credit package spills onto a
            second line so every mark keeps a tappable target. */}
        <div className="flex flex-wrap items-end gap-[3px]">
          {ticks.map((t, i) => (
            <InteractiveMark key={i} tick={t} low={lowFlags[i]} compact={false} />
          ))}
          {granted === 0 ? (
            <span className="text-xs text-muted-foreground">
              No credits granted.
            </span>
          ) : null}
        </div>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {used} of {granted} used
          {expiresLabel ? ` · expires ${expiresLabel}` : ""}
        </p>
      </div>
    </TooltipProvider>
  );
}
