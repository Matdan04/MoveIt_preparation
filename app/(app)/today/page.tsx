import { Role } from "@prisma/client";
import { requireActor } from "@/lib/auth/session";
import { getTodayDetailForActor, getMonthCountsForActor } from "@/lib/data/sessions";
import { getBookableCoachesForActor } from "@/lib/data/coaches";
import {
  formatKL,
  klDateKey,
  klDayWindowForKey,
  klMonthWindow,
} from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { SessionRow, type SessionRowData } from "./session-row";
import { CoachSelect } from "./coach-select";
import { MonthCalendar, type CalendarCell } from "./month-calendar";

const WINDOW_12H_MS = 12 * 60 * 60 * 1000;
const KL = "Asia/Kuala_Lumpur";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

// The timeline dot carries the same reserved status scale as the badges: a
// past session still SCHEDULED owes a mark (warning), otherwise colour follows
// the outcome. Chrome (primary) is used only for an upcoming, on-track session.
type DotTone = "primary" | "warning" | "positive" | "danger" | "inert";

function dotTone(status: SessionRowData["status"], owesMark: boolean): DotTone {
  if (owesMark) return "warning";
  switch (status) {
    case "ATTENDED":
      return "positive";
    case "NO_SHOW":
      return "danger";
    case "SCHEDULED":
      return "primary";
    default:
      return "inert";
  }
}

const dotClass: Record<DotTone, string> = {
  primary: "border-primary bg-primary/15",
  warning: "border-warning bg-warning/20",
  positive: "border-positive bg-positive/20",
  danger: "border-danger bg-danger/20",
  inert: "border-border bg-muted",
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string; coach?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;

  const isManager = actor.role === Role.MANAGER;
  const coaches = isManager ? await getBookableCoachesForActor(actor) : [];
  const coachFilter = params.coach;

  const todayKey = klDateKey(new Date());

  // The selected day and visible month come from the URL, both validated. The
  // day defaults to today; the month defaults to the selected day's month.
  const selectedKey =
    params.date && DATE_RE.test(params.date) && !Number.isNaN(Date.parse(params.date))
      ? params.date
      : todayKey;
  const monthKey =
    params.month && MONTH_RE.test(params.month)
      ? params.month
      : selectedKey.slice(0, 7);

  const year = Number(monthKey.slice(0, 4));
  const monthIndex = Number(monthKey.slice(5, 7)) - 1;

  // A link into the day view, preserving the manager's coach filter.
  function href(next: { date?: string; month?: string }): string {
    const search = new URLSearchParams();
    if (next.date) search.set("date", next.date);
    if (next.month) search.set("month", next.month);
    if (coachFilter) search.set("coach", coachFilter);
    const qs = search.toString();
    return qs ? `/today?${qs}` : "/today";
  }

  // Month grid: tally every day in the visible KL month, then lay out cells with
  // leading blanks for the weekday the 1st falls on (Sunday-first).
  const monthWindow = klMonthWindow(year, monthIndex);
  const counts = await getMonthCountsForActor(actor, monthWindow, coachFilter);
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const leading = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();

  const cells: CalendarCell[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${monthKey}-${String(d).padStart(2, "0")}`;
    const tally = counts[key];
    cells.push({
      dayNum: d,
      key,
      href: href({ date: key, month: monthKey }),
      count: tally?.count ?? 0,
      toMark: tally?.toMark ?? 0,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const prevIndex = monthIndex - 1;
  const nextIndex = monthIndex + 1;
  const prevKey = `${String(year + Math.floor(prevIndex / 12)).padStart(4, "0")}-${String(((prevIndex % 12) + 12) % 12 + 1).padStart(2, "0")}`;
  const nextKey = `${String(year + Math.floor(nextIndex / 12)).padStart(4, "0")}-${String(((nextIndex % 12) + 12) % 12 + 1).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: KL,
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, monthIndex, 15)));

  // The selected day's sessions, enriched for the timeline below the grid.
  const window = klDayWindowForKey(selectedKey);
  const sessions = await getTodayDetailForActor(actor, window, coachFilter);
  const now = Date.now();

  const rows: SessionRowData[] = sessions.map((s) => ({
    id: s.id,
    clientName: s.client.name,
    coachName: s.coach.user.name,
    timeLabel: formatKL(s.scheduledAt, "time"),
    durationMin: s.durationMin,
    status: s.status,
    note: s.outcomeNote?.body ?? null,
    expiresLabel: s.clientPackage ? formatKL(s.clientPackage.expiresAt, "date") : undefined,
    railEntries: (s.clientPackage?.ledgerEntries ?? []).map((e) => ({
      ...e,
      dateLabel: formatKL(e.createdAt, "date"),
    })),
    owesMark: s.status === "SCHEDULED" && s.scheduledAt.getTime() < now,
    within12h: now >= s.scheduledAt.getTime() - WINDOW_12H_MS,
  }));

  // A quiet read-out of the day's shape, in mono figures — not a dashboard.
  const summary = {
    total: rows.length,
    toMark: rows.filter((r) => r.owesMark).length,
    attended: rows.filter((r) => r.status === "ATTENDED").length,
    noShow: rows.filter((r) => r.status === "NO_SHOW").length,
  };

  // Heading date: interpret the ISO key at KL noon so the label is unambiguous.
  const selectedDateLabel = formatKL(`${selectedKey}T12:00:00+08:00`, "fullDate");

  return (
    <>
      <PageHeader
        title="Today"
        description="Your sessions in order. Two taps to mark attendance."
        actions={
          isManager ? (
            <CoachSelect coaches={coaches} value={coachFilter ?? "all"} />
          ) : undefined
        }
      />

      <MonthCalendar
        weeks={weeks}
        selectedKey={selectedKey}
        todayKey={todayKey}
        monthLabel={monthLabel}
        prevHref={href({ date: selectedKey, month: prevKey })}
        nextHref={href({ date: selectedKey, month: nextKey })}
        todayHref={href({ date: todayKey, month: todayKey.slice(0, 7) })}
      />

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">
          {selectedKey === todayKey ? "Today" : "Selected day"}
        </h2>
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {selectedDateLabel}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed bg-card/50 p-6 text-center text-sm text-muted-foreground">
          No sessions on this day.
        </p>
      ) : (
        <>
          <dl className="mt-4 mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <Stat label="Sessions" value={summary.total} />
            <Stat label="To mark" value={summary.toMark} tone="warning" />
            <Stat label="Attended" value={summary.attended} tone="positive" />
            <Stat label="No-show" value={summary.noShow} tone="danger" />
          </dl>

          <ol className="relative">
            {rows.map((s, i) => {
              const tone = dotTone(s.status, s.owesMark);
              const last = i === rows.length - 1;
              return (
                <li key={s.id} className="flex gap-3 sm:gap-4">
                  <div className="flex w-11 shrink-0 flex-col items-end pt-3 sm:w-14">
                    <time className="font-mono text-sm tabular-nums text-foreground">
                      {s.timeLabel}
                    </time>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {s.durationMin}m
                    </span>
                  </div>

                  {/* Time rail: a status-coloured node with a connector line to
                      the next session, giving the list a read-in-order spine. */}
                  <div className="relative flex flex-col items-center">
                    <span
                      className={cn(
                        "mt-3.5 size-3 shrink-0 rounded-full border-2",
                        dotClass[tone],
                      )}
                      aria-hidden
                    />
                    {!last ? <span className="w-px flex-1 bg-border" aria-hidden /> : null}
                  </div>

                  <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-3")}>
                    <SessionRow session={s} showCoach={isManager} />
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </>
  );
}

// One figure in the day-summary strip. An eyebrow label over a mono number,
// tinted only when the count carries state worth noticing.
function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "positive" | "danger";
}) {
  const active = value > 0;
  const toneClass =
    !active || tone === "default"
      ? "text-foreground"
      : tone === "warning"
        ? "text-warning"
        : tone === "positive"
          ? "text-positive"
          : "text-danger";
  return (
    <div className="bg-card p-3">
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("mt-1 font-mono text-2xl tabular-nums", toneClass)}>{value}</dd>
    </div>
  );
}
