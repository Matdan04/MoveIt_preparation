import { ScrollText } from "lucide-react";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { canViewAudit } from "@/lib/auth/authz";
import { getAuditLogForActor, getAuditFacetsForActor } from "@/lib/data/audit";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AuditFilters } from "@/components/audit-filters";
import { AuditEntryRow } from "@/components/audit-entry-row";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; action?: string }>;
}) {
  const actor = await requireActor();
  // 404 for non-managers rather than reveal the screen; the data read's
  // ForbiddenError is the hard backstop.
  if (!canViewAudit(actor)) notFound();

  const filters = await searchParams;
  const [entries, facets] = await Promise.all([
    getAuditLogForActor(actor, filters),
    getAuditFacetsForActor(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Audit"
        description="Every mutation, who made it, and what changed."
      />

      <div className="space-y-4">
        <AuditFilters
          entityTypes={facets.entityTypes}
          actions={facets.actions}
        />

        {entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No matching entries"
            description="No audited mutations match these filters yet. Clear the filters, or perform a mutation elsewhere in the app to see it recorded here."
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <AuditEntryRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
