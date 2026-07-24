// Actor-scoped reads for the audit log. Manager-only, so this gates at the role
// level and throws ForbiddenError for anyone else.

import type { Actor } from "@/lib/auth/session";
import { assertCanViewAudit } from "@/lib/auth/authz";
import { prisma } from "@/lib/db";

export async function getAuditLogForActor(actor: Actor, take = 100) {
  assertCanViewAudit(actor);
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    // Only the actor's name is surfaced — never their password hash or other
    // sensitive User columns.
    include: { actor: { select: { id: true, name: true } } },
  });
}
