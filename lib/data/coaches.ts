// Actor-scoped reads for coaches. Two shapes: a lightweight list for select
// controls (who can a session be booked with, who can a client be assigned to)
// and the manager assignments roster with per-coach capacity. Both derive their
// gate from the actor — there is no unscoped read.

import type { Actor } from "@/lib/auth/session";
import { canViewAllClients, assertCanManageAssignments } from "@/lib/auth/authz";
import { prisma } from "@/lib/db";

// Active coaches for a booking/assignment select. Front desk and manager see
// the whole roster; a coach books only for themselves, so they see just their
// own row. A coach with no coachId (a data fault) sees nothing.
export async function getBookableCoachesForActor(actor: Actor) {
  const seesAll = canViewAllClients(actor);
  if (!seesAll && !actor.coachId) return [];

  const coaches = await prisma.coach.findMany({
    where: seesAll ? { active: true } : { id: actor.coachId },
    orderBy: { user: { name: "asc" } },
    select: { id: true, user: { select: { name: true } } },
  });
  return coaches.map((c) => ({ id: c.id, name: c.user.name }));
}

// The manager assignments board: every coach with their weekly capacity and the
// clients currently assigned to them. Manager-only, so this gates at the role
// level and throws for anyone else.
export async function getCoachRosterForActor(actor: Actor) {
  assertCanManageAssignments(actor);
  return prisma.coach.findMany({
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      active: true,
      specialties: true,
      weeklyCapacityHours: true,
      user: { select: { name: true } },
      assignments: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        select: {
          startedAt: true,
          client: { select: { id: true, name: true, status: true } },
        },
      },
    },
  });
}
