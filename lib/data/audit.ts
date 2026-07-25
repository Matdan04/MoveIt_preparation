// Actor-scoped reads for the audit log. Manager-only, so this gates at the role
// level and throws ForbiddenError for anyone else.

import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/session";
import { assertCanViewAudit } from "@/lib/auth/authz";
import { prisma } from "@/lib/db";

export type AuditFilters = {
  entityType?: string;
  action?: string;
};

export async function getAuditLogForActor(
  actor: Actor,
  filters: AuditFilters = {},
  take = 100,
) {
  assertCanViewAudit(actor);

  // Filters come from the query string, so they are untrusted. They only ever
  // narrow a WHERE clause on a manager-scoped read — no ownership to re-check —
  // and an unknown value simply matches nothing.
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.action) where.action = filters.action;

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    // Only the actor's name is surfaced — never their password hash or other
    // sensitive User columns.
    include: { actor: { select: { id: true, name: true } } },
  });
}

// The distinct entity types and actions present in the log, for the filter
// dropdowns. Derived from the data rather than hard-coded so a newly audited
// action shows up without touching this screen.
export async function getAuditFacetsForActor(actor: Actor): Promise<{
  entityTypes: string[];
  actions: string[];
}> {
  assertCanViewAudit(actor);

  const [byEntity, byAction] = await Promise.all([
    prisma.auditLog.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
  ]);

  return {
    entityTypes: byEntity.map((r) => r.entityType),
    actions: byAction.map((r) => r.action),
  };
}

export type AuditEntryRow = Awaited<
  ReturnType<typeof getAuditLogForActor>
>[number];
