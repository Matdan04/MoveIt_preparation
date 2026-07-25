// Actor-scoped reads for coaches. Two shapes: a lightweight list for select
// controls (who can a session be booked with, who can a client be assigned to)
// and the manager assignments roster with per-coach capacity. Both derive their
// gate from the actor — there is no unscoped read.

import type { Actor } from "@/lib/auth/session";
import {
  canViewAllClients,
  canViewCoachProfile,
  assertCanManageAssignments,
  assertCanManageCoaches,
} from "@/lib/auth/authz";
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

// The manager's coach-management roster. Distinct from the assignments board:
// this is the staffing list a manager adds to and edits, so it carries the
// contact email and the load/history counts the roster row needs — an active
// client count for the load figure, and a total history count to decide whether
// a coach can be hard-deleted or only deactivated. Manager-only. Only the
// coach's own User name/email cross the boundary; passwordHash never enters the
// select.
export async function getCoachesForManagement(actor: Actor) {
  assertCanManageCoaches(actor);
  const coaches = await prisma.coach.findMany({
    orderBy: [{ active: "desc" }, { user: { name: "asc" } }],
    select: {
      id: true,
      active: true,
      specialties: true,
      weeklyCapacityHours: true,
      user: { select: { name: true, email: true } },
      // Active assignments as a list for the live load figure...
      assignments: { where: { endedAt: null }, select: { id: true } },
      // ...and the unfiltered totals that decide deletability. hasHistory here
      // mirrors deleteCoach's guard exactly: ANY assignment (past or present),
      // session, or note means the coach can only be deactivated.
      _count: {
        select: {
          assignments: true,
          trainingSessions: true,
          outcomeNotes: true,
        },
      },
    },
  });
  return coaches.map((c) => ({
    id: c.id,
    name: c.user.name,
    email: c.user.email,
    active: c.active,
    specialties: c.specialties,
    weeklyCapacityHours: c.weeklyCapacityHours,
    activeClients: c.assignments.length,
    hasHistory:
      c._count.assignments > 0 ||
      c._count.trainingSessions > 0 ||
      c._count.outcomeNotes > 0,
  }));
}

// A single coach's profile, scoped like a client read: a manager sees any coach,
// a coach sees only their own record, everyone else (and any out-of-scope id)
// gets null so the caller answers notFound() without leaking existence. Carries
// the profile fields, the current active-client list for the load figure, and a
// window of recent sessions. No passwordHash, and no other user's contact
// details — only this coach's own name and email.
export async function getCoachDetailForActor(actor: Actor, coachId: string) {
  if (!canViewCoachProfile(actor, coachId)) return null;

  const coach = await prisma.coach.findUnique({
    where: { id: coachId },
    select: {
      id: true,
      active: true,
      specialties: true,
      weeklyCapacityHours: true,
      user: { select: { name: true, email: true } },
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
  if (!coach) return null;

  const recentSessions = await prisma.trainingSession.findMany({
    where: { coachId },
    orderBy: { scheduledAt: "desc" },
    take: 8,
    select: {
      id: true,
      scheduledAt: true,
      durationMin: true,
      status: true,
      client: { select: { id: true, name: true } },
    },
  });

  return { coach, recentSessions };
}
