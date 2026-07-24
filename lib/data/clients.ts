// Actor-scoped reads for clients. This is the ONLY place domain client reads
// touch prisma.
//
// How scope-widening is made structurally impossible, not merely discouraged:
// none of these functions expose a `where`, filter, or coachId parameter a
// caller could use to reach past their own scope. The only client-supplied
// input is a resource id to look up, which is then re-checked against the
// actor's scope inside the query. Scope is derived from `actor` alone, so
// there is no argument through which a caller can widen it.

import type { Actor } from "@/lib/auth/session";
import { canViewAllClients } from "@/lib/auth/authz";
import { prisma } from "@/lib/db";

// A coach's client set is exactly the clients with a currently-active
// assignment to them. Reassigning a coach away (endedAt set) removes access.
function coachScope(actor: Actor) {
  return {
    assignments: { some: { coachId: actor.coachId, endedAt: null } },
  } as const;
}

export async function getClientsForActor(actor: Actor) {
  // Front desk and manager see the whole book; a coach sees only their own.
  const where = canViewAllClients(actor) ? {} : coachScope(actor);
  return prisma.client.findMany({
    where,
    orderBy: { name: "asc" },
  });
}

// Returns null — not a thrown error — when the client is out of the actor's
// scope, so the caller can answer notFound() and never reveal the client
// exists. findFirst with the scope folded into the WHERE means an out-of-scope
// id and a non-existent id are indistinguishable to the caller.
export async function getClientForActor(actor: Actor, clientId: string) {
  const where = canViewAllClients(actor)
    ? { id: clientId }
    : { id: clientId, ...coachScope(actor) };
  return prisma.client.findFirst({ where });
}
