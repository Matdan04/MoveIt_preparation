import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Role } from "@prisma/client";
import { requireActor } from "@/lib/auth/session";
import { getTodayDetailForActor } from "@/lib/data/sessions";
import { getBookableCoachesForActor } from "@/lib/data/coaches";
import { formatKL, klDayWindow } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { SessionRow, type SessionRowData } from "./session-row";
import { CoachSelect } from "./coach-select";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_12H_MS = 12 * 60 * 60 * 1000;

// The KL day the given offset (-1 today +1) lands on, as a UTC window.
function windowForOffset(offset: number): { from: Date; to: Date } {
  return klDayWindow(new Date(Date.now() + offset * DAY_MS));
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; coach?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;

  const offset = Number(params.d ?? "0");
  const safeOffset = Number.isInteger(offset) && Math.abs(offset) <= 1 ? offset : 0;
  const window = windowForOffset(safeOffset);

  const isManager = actor.role === Role.MANAGER;
  const coaches = isManager ? await getBookableCoachesForActor(actor) : [];
  const coachFilter = params.coach;

  const sessions = await getTodayDetailForActor(actor, window, coachFilter);
  const now = Date.now();

  const rows: SessionRowData[] = sessions.map((s) => ({
    id: s.id,
    clientName: s.client.name,
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

  // The date strip: yesterday, today, tomorrow. Preserve the coach filter.
  const days = [-1, 0, 1].map((o) => {
    const search = new URLSearchParams();
    if (o !== 0) search.set("d", String(o));
    if (coachFilter) search.set("coach", coachFilter);
    const label = o === 0 ? "Today" : formatKL(new Date(Date.now() + o * DAY_MS), "weekday");
    const qs = search.toString();
    return { offset: o, label, href: qs ? `/today?${qs}` : "/today" };
  });

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

      <nav className="mb-4 flex gap-1" aria-label="Day">
        {days.map((d) => (
          <Link
            key={d.offset}
            href={d.href}
            aria-current={d.offset === safeOffset ? "page" : undefined}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              d.offset === safeOffset
                ? "border-primary/40 bg-card font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/40",
            )}
          >
            {d.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No sessions today."
          description="Nothing is booked for this day. Check tomorrow, or book a session from a client's page."
          action={
            <Link
              href={days[2].href}
              className="text-sm font-medium text-primary hover:underline"
            >
              View tomorrow
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      )}
    </>
  );
}
