import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { canManageAssignments } from "@/lib/auth/authz";
import { getCoachRosterForActor } from "@/lib/data/coaches";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ReassignDialog } from "@/components/reassign-dialog";
import { Progress } from "@/components/ui/progress";
import { Time } from "@/components/time";
import { cn } from "@/lib/utils";

// One standing weekly hour per active client — the same assumption the
// assignments service uses for its capacity warning.
const HOURS_PER_CLIENT = 1;

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string }>;
}) {
  const actor = await requireActor();
  // 404 for non-managers rather than reveal the screen; the data read's
  // ForbiddenError is the hard backstop.
  if (!canManageAssignments(actor)) notFound();

  const roster = await getCoachRosterForActor(actor);
  const params = await searchParams;
  const selectedId =
    roster.find((c) => c.id === params.coach)?.id ?? roster[0]?.id ?? null;
  const selected = roster.find((c) => c.id === selectedId) ?? null;

  const coachOptions = roster.map((c) => ({ id: c.id, name: c.user.name }));

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Client assignments and capacity across the team. Capacity warns, it never blocks."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
        <nav className="space-y-2" aria-label="Coaches">
          {roster.map((c) => {
            const load = c.assignments.length * HOURS_PER_CLIENT;
            const over = load > c.weeklyCapacityHours;
            const pct =
              c.weeklyCapacityHours > 0
                ? Math.min(100, (load / c.weeklyCapacityHours) * 100)
                : 100;
            return (
              <Link
                key={c.id}
                href={`/manage/assignments?coach=${c.id}`}
                aria-current={c.id === selectedId ? "page" : undefined}
                className={cn(
                  "block space-y-2 rounded-lg border p-3 transition-colors",
                  c.id === selectedId
                    ? "border-primary/40 bg-card"
                    : "hover:bg-accent/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.user.name}</span>
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      over ? "text-warning" : "text-muted-foreground",
                    )}
                  >
                    {load} / {c.weeklyCapacityHours}h
                  </span>
                </div>
                <Progress
                  value={pct}
                  className={cn(
                    over &&
                      "[&_[data-slot=progress-indicator]]:bg-warning",
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <section className="space-y-3">
          {selected ? (
            <>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {selected.user.name} · {selected.assignments.length} active client
                {selected.assignments.length === 1 ? "" : "s"}
              </h2>
              {selected.assignments.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No clients assigned to {selected.user.name}. Reassign one from
                  another coach, or from a client&apos;s page.
                </p>
              ) : (
                <ul className="space-y-2">
                  {selected.assignments.map((a) => (
                    <li
                      key={a.client.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/clients/${a.client.id}`}
                          className="font-medium hover:underline"
                        >
                          {a.client.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Since <Time value={a.startedAt} format="date" />
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={a.client.status} />
                        <ReassignDialog
                          clientId={a.client.id}
                          clientName={a.client.name}
                          coaches={coachOptions}
                          currentCoachId={selected.id}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No coaches on the roster yet.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
