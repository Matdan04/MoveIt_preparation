import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { LeadStatus } from "@prisma/client";
import { requireActor } from "@/lib/auth/session";
import { canAccessLeads } from "@/lib/auth/authz";
import { getLeadsForActor } from "@/lib/data/leads";
import { legalLeadTransitions } from "@/lib/services/leads";
import { formatKL } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { LeadRow, type LeadRowData } from "./lead-row";
import { AddLeadDialog } from "./add-lead-dialog";

const DAY_MS = 24 * 60 * 60 * 1000;

// Tab order follows the funnel; each carries a count and an empty line.
const TABS: { status: LeadStatus; label: string; empty: string }[] = [
  { status: "NEW", label: "New", empty: "No new leads." },
  { status: "CONTACTED", label: "Contacted", empty: "Nothing contacted yet." },
  { status: "TRIAL_BOOKED", label: "Trial booked", empty: "No trials booked." },
  { status: "CONVERTED", label: "Converted", empty: "No conversions yet." },
  { status: "LOST", label: "Lost", empty: "No leads marked lost." },
];

function isStatus(v: string | undefined): v is LeadStatus {
  return v !== undefined && v in LeadStatus;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requireActor();
  // A coach has no claim to leads at all. Answer 404 rather than reveal the
  // screen exists; the data layer's ForbiddenError is the hard backstop below.
  if (!canAccessLeads(actor)) notFound();

  const params = await searchParams;
  const active: LeadStatus = isStatus(params.status) ? params.status : "NEW";

  const leads = await getLeadsForActor(actor);
  const now = Date.now();

  const counts = new Map<LeadStatus, number>();
  for (const l of leads) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);

  const rows: LeadRowData[] = leads
    .filter((l) => l.status === active)
    .map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      source: l.source,
      ownerName: l.owner.name,
      status: l.status,
      ageDays: Math.floor((now - l.createdAt.getTime()) / DAY_MS),
      dateLabel: formatKL(l.createdAt, "date"),
      transitions: legalLeadTransitions(l.status),
      canConvert: l.status === "TRIAL_BOOKED",
    }));

  const activeEmpty = TABS.find((t) => t.status === active)?.empty ?? "No leads.";

  return (
    <>
      <PageHeader
        title="Leads"
        description="Capture, contact, convert."
        actions={<AddLeadDialog />}
      />

      <div
        role="tablist"
        aria-label="Lead status"
        className="mb-4 flex flex-wrap gap-1 border-b"
      >
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/leads?status=${t.status}`}
            role="tab"
            aria-selected={t.status === active}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              t.status === active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}{" "}
            <span className="font-mono tabular-nums text-muted-foreground">
              {counts.get(t.status) ?? 0}
            </span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={activeEmpty}
          description="New leads appear here as the front desk captures them."
          action={<AddLeadDialog />}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="h-10">Name</TableHead>
                <TableHead className="h-10">Phone</TableHead>
                <TableHead className="h-10">Source</TableHead>
                <TableHead className="h-10">Owner</TableHead>
                <TableHead className="h-10 text-right">Age</TableHead>
                <TableHead className="h-10 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((lead) => (
                <LeadRow key={lead.id} lead={lead} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
