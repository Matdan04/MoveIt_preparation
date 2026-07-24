// Actor-scoped reads for training sessions. A coach sees only sessions they
// coach; front desk and manager see all. As in clients.ts, no caller-supplied
// filter can widen the coach scope — the coachId in the WHERE comes from the
// actor, never from an argument. A time window may be passed (it narrows, and
// is a UX concern, not a security one).

import type { Actor } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

// Only a coach is scoped; everyone else sees every coach's sessions.
function scopeWhere(actor: Actor) {
  return actor.role === Role.COACH ? { coachId: actor.coachId } : {};
}

// Named select so a session list can render client and coach names without
// pulling any User row's sensitive columns across the RSC boundary.
const listSelect = {
  id: true,
  scheduledAt: true,
  durationMin: true,
  status: true,
  clientPackageId: true,
  client: { select: { id: true, name: true } },
  coach: { select: { id: true, user: { select: { name: true } } } },
} as const;

export async function getSessionsForActor(
  actor: Actor,
  window?: { from: Date; to: Date },
) {
  const timeWhere =
    window !== undefined
      ? { scheduledAt: { gte: window.from, lt: window.to } }
      : {};
  return prisma.trainingSession.findMany({
    where: { ...scopeWhere(actor), ...timeWhere },
    orderBy: { scheduledAt: "asc" },
    select: listSelect,
  });
}

// The coach's day view. The window is the caller's MYT day boundaries in UTC;
// coach scoping is still applied regardless of what window is passed.
export async function getTodaySessionsForActor(
  actor: Actor,
  window: { from: Date; to: Date },
) {
  return getSessionsForActor(actor, window);
}

// null (not a throw) for an out-of-scope session id, so the caller answers
// notFound() without leaking that the session exists.
export async function getSessionForActor(actor: Actor, sessionId: string) {
  return prisma.trainingSession.findFirst({
    where: { id: sessionId, ...scopeWhere(actor) },
    select: listSelect,
  });
}
