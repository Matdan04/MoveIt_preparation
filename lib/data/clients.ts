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

// The client list, enriched for the roster table: current coach name, the
// ledger of every active package (so the compact rail renders from rows, never
// a stored count), and the soonest upcoming session. Scope is inherited from
// getClientsForActor — a coach sees only their assigned clients.
export async function getClientRosterForActor(actor: Actor) {
  const where = canViewAllClients(actor) ? {} : coachScope(actor);
  const now = new Date();
  return prisma.client.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      assignments: {
        where: { endedAt: null },
        select: { coach: { select: { user: { select: { name: true } } } } },
      },
      clientPackages: {
        where: { expiresAt: { gt: now } },
        select: {
          ledgerEntries: {
            select: {
              id: true,
              delta: true,
              reason: true,
              trainingSessionId: true,
              createdAt: true,
            },
          },
        },
      },
      trainingSessions: {
        where: { status: "SCHEDULED", scheduledAt: { gt: now } },
        orderBy: { scheduledAt: "asc" },
        take: 1,
        select: { scheduledAt: true },
      },
    },
  });
}

// Named selects keep every User join down to a display name — passwordHash and
// contact columns never enter the RSC payload for a client detail render.
const ledgerDetail = {
  select: {
    id: true,
    delta: true,
    reason: true,
    trainingSessionId: true,
    createdAt: true,
    createdBy: { select: { name: true } },
    trainingSession: { select: { status: true, scheduledAt: true } },
  },
} as const;

// The full client detail read. Returns null (not a throw) when the client is
// out of the actor's scope, so the page answers notFound() and never reveals
// the client exists. Financials — packages and their ledgers — are only loaded
// for actors who may view all clients (front desk, manager); a coach sees the
// person, their sessions and notes, but not the credit ledger or manual
// adjustments, matching the capability table.
export async function getClientDetailForActor(actor: Actor, clientId: string) {
  const scope = canViewAllClients(actor)
    ? { id: clientId }
    : { id: clientId, ...coachScope(actor) };

  const client = await prisma.client.findFirst({
    where: scope,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      status: true,
      joinedAt: true,
    },
  });
  if (!client) return null;

  const showFinancials = canViewAllClients(actor);

  const sessions = await prisma.trainingSession.findMany({
    where: { clientId },
    orderBy: { scheduledAt: "desc" },
    select: {
      id: true,
      scheduledAt: true,
      durationMin: true,
      status: true,
      coach: { select: { user: { select: { name: true } } } },
      outcomeNote: { select: { body: true } },
    },
  });

  const packages = showFinancials
    ? await prisma.clientPackage.findMany({
        where: { clientId },
        orderBy: { expiresAt: "desc" },
        select: {
          id: true,
          purchasedAt: true,
          expiresAt: true,
          creditsGranted: true,
          package: { select: { name: true } },
          ledgerEntries: ledgerDetail,
        },
      })
    : [];

  return { client, sessions, packages, showFinancials };
}
