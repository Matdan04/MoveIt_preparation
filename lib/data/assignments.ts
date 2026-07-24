// Actor-scoped reads for coach assignments.

import type { Actor } from "@/lib/auth/session";
import { assertCanManageAssignments } from "@/lib/auth/authz";
import { prisma } from "@/lib/db";
import { getClientForActor } from "@/lib/data/clients";

const coachName = {
  select: { id: true, user: { select: { name: true } } },
} as const;

// A client's assignment history, newest first. Gated by whether the actor can
// see the client at all: if getClientForActor returns null the client is out
// of scope, so we return null and the caller answers notFound() — the coach
// never learns the client (or its coaching history) exists.
export async function getAssignmentHistoryForActor(
  actor: Actor,
  clientId: string,
) {
  const client = await getClientForActor(actor, clientId);
  if (!client) return null;

  return prisma.coachAssignment.findMany({
    where: { clientId },
    orderBy: { startedAt: "desc" },
    include: { coach: coachName },
  });
}

// The manager assignments board: every client with its current coach (if any).
// Manager-only capability, so this gates at the role level.
export async function getActiveAssignmentsForActor(actor: Actor) {
  assertCanManageAssignments(actor);
  return prisma.client.findMany({
    orderBy: { name: "asc" },
    include: {
      assignments: {
        where: { endedAt: null },
        include: { coach: coachName },
      },
    },
  });
}
