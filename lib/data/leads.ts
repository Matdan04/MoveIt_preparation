// Actor-scoped reads for leads. Leads are a front-desk/manager surface; a coach
// has no lead capability at all, so these gate at the role level and throw
// ForbiddenError rather than returning null — a lead is not a per-coach
// resource whose existence could leak, so failing loudly is correct.

import type { Actor } from "@/lib/auth/session";
import { assertCanAccessLeads } from "@/lib/auth/authz";
import { prisma } from "@/lib/db";

export async function getLeadsForActor(actor: Actor) {
  assertCanAccessLeads(actor);
  return prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getLeadForActor(actor: Actor, leadId: string) {
  assertCanAccessLeads(actor);
  return prisma.lead.findUnique({ where: { id: leadId } });
}
