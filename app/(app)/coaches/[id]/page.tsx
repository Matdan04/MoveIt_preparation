import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Users, CalendarDays } from "lucide-react";
import { requireActor } from "@/lib/auth/session";
import { canManageCoaches } from "@/lib/auth/authz";
import { getCoachDetailForActor } from "@/lib/data/coaches";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Time } from "@/components/time";
import { cn } from "@/lib/utils";
import { EditCoachButton } from "@/app/(app)/manage/coaches/edit-coach-dialog";

export default async function CoachDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;

  // Scoped read: a manager sees any coach, a coach sees only themselves, and any
  // other actor or a forged id returns null — so an out-of-scope coach is
  // indistinguishable from one that does not exist.
  const detail = await getCoachDetailForActor(actor, id);
  if (!detail) notFound();

  const { coach, recentSessions } = detail;
  const isManager = canManageCoaches(actor);
  const isSelf = actor.coachId === coach.id;

  const load = coach.assignments.length;
  const over = load > coach.weeklyCapacityHours;
  const pct =
    coach.weeklyCapacityHours > 0
      ? Math.min(100, (load / coach.weeklyCapacityHours) * 100)
      : 100;

  return (
    <>
      <PageHeader
        title={coach.user.name}
        description={isSelf ? "Your coaching profile." : "Coach profile."}
        actions={
          isManager ? (
            <EditCoachButton
              coach={{
                id: coach.id,
                name: coach.user.name,
                specialties: coach.specialties,
                weeklyCapacityHours: coach.weeklyCapacityHours,
              }}
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <aside className="space-y-4">
          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Profile</span>
              {coach.active ? (
                <Badge
                  variant="outline"
                  className="border-positive/30 bg-positive/10 text-positive"
                >
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Inactive
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{coach.user.email}</span>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Specialties</span>
              {coach.specialties.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {coach.specialties.map((s) => (
                    <Badge key={s} variant="secondary" className="font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None recorded.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Weekly load
                </span>
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    over ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {load} / {coach.weeklyCapacityHours}h
                </span>
              </div>
              <Progress
                value={pct}
                className={cn(
                  over && "[&_[data-slot=progress-indicator]]:bg-warning",
                )}
              />
              {over ? (
                <p className="text-xs text-warning">
                  Over capacity — a warning, never a block.
                </p>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <Users className="size-3.5" strokeWidth={2} />
              Active clients · {coach.assignments.length}
            </h2>
            {coach.assignments.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No clients currently assigned.
              </p>
            ) : (
              <ul className="space-y-2">
                {coach.assignments.map((a) => (
                  <li
                    key={a.client.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="min-w-0">
                      {isManager ? (
                        <Link
                          href={`/clients/${a.client.id}`}
                          className="font-medium hover:underline"
                        >
                          {a.client.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{a.client.name}</span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Since <Time value={a.startedAt} format="date" />
                      </p>
                    </div>
                    <StatusBadge status={a.client.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <CalendarDays className="size-3.5" strokeWidth={2} />
              Recent sessions
            </h2>
            {recentSessions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sessions on record yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentSessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{s.client.name}</span>
                      <p className="text-xs text-muted-foreground">
                        <Time value={s.scheduledAt} format="datetime" /> ·{" "}
                        {s.durationMin} min
                      </p>
                    </div>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
