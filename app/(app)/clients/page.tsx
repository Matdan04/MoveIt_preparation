import Link from "next/link";
import { Users } from "lucide-react";
import { Role } from "@prisma/client";
import { requireActor } from "@/lib/auth/session";
import { getClientRosterForActor } from "@/lib/data/clients";
import { formatKL } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { CreditRail, type RailEntry } from "@/components/credit-rail";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ClientsPage() {
  const actor = await requireActor();
  const clients = await getClientRosterForActor(actor);
  const isCoach = actor.role === Role.COACH;

  return (
    <>
      <PageHeader
        title="Clients"
        description={
          isCoach ? "Showing your assigned clients." : "Everyone on the books."
        }
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={isCoach ? "No clients assigned to you." : "No clients yet."}
          description={
            isCoach
              ? "Clients appear here once a manager assigns them to you."
              : "Convert a lead to create the first client."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="h-10">Name</TableHead>
                <TableHead className="h-10">Coach</TableHead>
                <TableHead className="h-10">Credits</TableHead>
                <TableHead className="h-10">Next session</TableHead>
                <TableHead className="h-10 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => {
                const coachName =
                  c.assignments[0]?.coach.user.name ?? "Unassigned";
                const next = c.trainingSessions[0]?.scheduledAt;
                // Combined ledger across the client's active packages — a
                // glanceable aggregate, still derived from rows, never a count.
                const entries: RailEntry[] = c.clientPackages.flatMap((p) =>
                  p.ledgerEntries.map((e) => ({
                    ...e,
                    dateLabel: formatKL(e.createdAt, "date"),
                  })),
                );
                return (
                  <TableRow key={c.id} className="h-10">
                    <TableCell className="font-medium">
                      <Link
                        href={`/clients/${c.id}`}
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {coachName}
                    </TableCell>
                    <TableCell>
                      {entries.length > 0 ? (
                        <CreditRail entries={entries} variant="compact" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-muted-foreground">
                      {next ? formatKL(next, "datetime") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge status={c.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
