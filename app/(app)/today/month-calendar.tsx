import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// A read-only month grid, server-rendered as links so navigating a day or a
// month is a plain request — no client fetching, matching the app's RSC-only
// data flow. It shows how full each day is (a mono count) and flags the days
// that still owe an attendance mark (a warning dot), so a coach or manager can
// see the shape of the month before drilling into one day below.

export type CalendarCell = {
  dayNum: number;
  key: string; // KL ISO date, "2026-07-25"
  href: string;
  count: number;
  toMark: number;
} | null;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthCalendar({
  weeks,
  selectedKey,
  todayKey,
  monthLabel,
  prevHref,
  nextHref,
  todayHref,
}: {
  weeks: CalendarCell[][];
  selectedKey: string;
  todayKey: string;
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-1">
          <Link
            href={prevHref}
            aria-label="Previous month"
            className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </Link>
          <Link
            href={nextHref}
            aria-label="Next month"
            className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </Link>
        </div>
        <h2 className="text-sm font-semibold tracking-tight">{monthLabel}</h2>
        <Link
          href={todayHref}
          className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Today
        </Link>
      </div>

      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flat().map((cell, i) => {
          if (!cell) {
            return (
              <div
                key={`blank-${i}`}
                className="min-h-14 border-b border-r last:border-r-0 sm:min-h-20 [&:nth-child(7n)]:border-r-0"
                aria-hidden
              />
            );
          }
          const selected = cell.key === selectedKey;
          const isToday = cell.key === todayKey;
          return (
            <Link
              key={cell.key}
              href={cell.href}
              aria-current={selected ? "date" : undefined}
              aria-label={`${cell.dayNum}${cell.count ? `, ${cell.count} session${cell.count === 1 ? "" : "s"}` : ", no sessions"}`}
              className={cn(
                "group relative flex min-h-14 flex-col gap-1 border-b border-r p-1.5 transition-colors last:border-r-0 hover:bg-accent/40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:min-h-20 sm:p-2 [&:nth-child(7n)]:border-r-0",
                selected && "bg-primary/5",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full font-mono text-xs tabular-nums",
                  selected
                    ? "bg-primary font-medium text-primary-foreground"
                    : isToday
                      ? "border border-primary/40 text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {cell.dayNum}
              </span>

              {cell.count > 0 ? (
                <span className="mt-auto flex items-center gap-1.5">
                  {cell.toMark > 0 ? (
                    <span
                      className="size-1.5 rounded-full bg-warning"
                      aria-hidden
                    />
                  ) : null}
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {cell.count} <span className="hidden sm:inline">session{cell.count === 1 ? "" : "s"}</span>
                  </span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
