import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireActor } from "@/lib/auth/session";
import { canManageAssignments } from "@/lib/auth/authz";
import { getClientDetailForActor } from "@/lib/data/clients";
import { getAssignmentHistoryForActor } from "@/lib/data/assignments";
import { getBookableCoachesForActor } from "@/lib/data/coaches";
import { formatKL } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { CreditRail, type RailEntry } from "@/components/credit-rail";
import { ReassignDialog } from "@/components/reassign-dialog";
import { Time } from "@/components/time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { BookDialog } from "./book-dialog";

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

// A package's ledger, enriched for the rail's tooltips with server-formatted
// (KL) labels — never formatted in the browser.
function toRailEntries(
  entries: {
    id: string;
    delta: number;
    reason: string;
    trainingSessionId: string | null;
    createdAt: Date;
    createdBy: { name: string };
    trainingSession: { status: string; scheduledAt: Date } | null;
  }[],
): RailEntry[] {
  return entries.map((e) => ({
    id: e.id,
    delta: e.delta,
    reason: e.reason,
    trainingSessionId: e.trainingSessionId,
    createdAt: e.createdAt,
    dateLabel: formatKL(e.createdAt, "datetime"),
    actorName: e.createdBy.name,
    sessionStatus: e.trainingSession?.status as RailEntry["sessionStatus"],
    sessionLabel: e.trainingSession
      ? formatKL(e.trainingSession.scheduledAt, "datetime")
      : undefined,
  }));
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;

  const detail = await getClientDetailForActor(actor, id);
  // notFound(), not a 403: for a coach reaching a client that isn't theirs, the
  // existence of the client is itself information we don't leak. The scoped read
  // already returned null; we cannot tell "no such client" from "not yours".
  if (!detail) notFound();

  const { client, sessions, packages, showFinancials } = detail;
  const history = (await getAssignmentHistoryForActor(actor, id)) ?? [];
  const current = history.find((h) => h.endedAt === null) ?? null;
  const past = history.filter((h) => h.endedAt !== null);

  const isManager = actor.role === Role.MANAGER;
  const coaches = await getBookableCoachesForActor(actor);

  const now = Date.now();
  const activePackages = packages.filter((p) => p.expiresAt.getTime() > now);
  const expiredPackages = packages.filter((p) => p.expiresAt.getTime() <= now);

  return (
    <>
      <PageHeader
        title={client.name}
        description={
          <span className="flex items-center gap-2">
            <StatusBadge status={client.status} />
            <span className="font-mono tabular-nums">{client.phone}</span>
            {client.email ? <span className="font-mono">{client.email}</span> : null}
          </span>
        }
        actions={coaches.length > 0 ? <BookDialog clientId={client.id} coaches={coaches} /> : undefined}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {showFinancials ? (
            <section className="space-y-3 rounded-lg border bg-card p-4">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Packages
              </h2>
              {activePackages.length === 0 && expiredPackages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No packages purchased. Book one to grant credits.
                </p>
              ) : null}
              {activePackages.map((p) => (
                <div key={p.id} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{p.package.name}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      expires {formatKL(p.expiresAt, "date")}
                    </span>
                  </div>
                  <CreditRail
                    entries={toRailEntries(p.ledgerEntries)}
                    expiresLabel={formatKL(p.expiresAt, "date")}
                  />
                </div>
              ))}
              {expiredPackages.length > 0 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    {expiredPackages.length} expired package
                    {expiredPackages.length > 1 ? "s" : ""}
                  </summary>
                  <div className="space-y-3 pt-3">
                    {expiredPackages.map((p) => (
                      <div key={p.id} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>{p.package.name}</span>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            expired {formatKL(p.expiresAt, "date")}
                          </span>
                        </div>
                        <CreditRail entries={toRailEntries(p.ledgerEntries)} />
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Sessions
            </h2>
            {sessions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sessions yet. Book one to get started.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="h-10">When</TableHead>
                      <TableHead className="h-10">Coach</TableHead>
                      <TableHead className="h-10">Note</TableHead>
                      <TableHead className="h-10 text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => (
                      <TableRow key={s.id} className="h-10">
                        <TableCell className="whitespace-nowrap">
                          <Time value={s.scheduledAt} format="datetime" />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.coach.user.name}
                        </TableCell>
                        <TableCell
                          className="max-w-[16rem] truncate text-muted-foreground"
                          title={s.outcomeNote?.body ?? undefined}
                        >
                          {s.outcomeNote?.body ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <StatusBadge status={s.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Coach
            </h2>
            {current ? (
              <div className="flex items-center gap-3">
                <Avatar className="size-9">
                  <AvatarFallback>{initials(current.coach.user.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{current.coach.user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Since <Time value={current.startedAt} format="date" />
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No coach assigned.</p>
            )}
            {isManager ? (
              <ReassignDialog
                clientId={client.id}
                clientName={client.name}
                coaches={coaches}
                currentCoachId={current?.coach.id}
              />
            ) : null}
          </section>

          {past.length > 0 ? (
            <section className="space-y-3 rounded-lg border bg-card p-4">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Assignment history
              </h2>
              <ul className="space-y-3 text-sm">
                {past.map((h, i) => (
                  <li key={i} className="space-y-0.5">
                    <p className="font-medium">{h.coach.user.name}</p>
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      <Time value={h.startedAt} format="date" /> —{" "}
                      {h.endedAt ? <Time value={h.endedAt} format="date" /> : "present"}
                    </p>
                    {h.reason ? (
                      <p className="text-xs text-muted-foreground">{h.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
