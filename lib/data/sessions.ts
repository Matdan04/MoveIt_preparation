// Actor-scoped reads for training sessions. A coach sees only sessions they
// coach; front desk and manager see all. As in clients.ts, no caller-supplied
// filter can widen the coach scope — the coachId in the WHERE comes from the
// actor, never from an argument. A time window may be passed (it narrows, and
// is a UX concern, not a security one).

import type { Actor } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { klDateKey } from "@/lib/format";

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

// The coach day view, enriched: each session carries the client name and the
// ledger of the package backing it, so the row can render the compact credit
// rail from rows rather than a stored count. Coach scoping still applies — the
// window only narrows, it never widens past the actor's own sessions.
export async function getTodayDetailForActor(
  actor: Actor,
  window: { from: Date; to: Date },
  narrowCoachId?: string,
) {
  // A manager may narrow the view to one coach (the header select). This only
  // narrows: for a COACH actor scopeWhere already pins coachId to their own, so
  // a supplied id can never widen past the actor's own sessions.
  const narrow =
    narrowCoachId && actor.role !== Role.COACH ? { coachId: narrowCoachId } : {};
  return prisma.trainingSession.findMany({
    where: {
      ...scopeWhere(actor),
      ...narrow,
      scheduledAt: { gte: window.from, lt: window.to },
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      scheduledAt: true,
      durationMin: true,
      status: true,
      client: { select: { id: true, name: true } },
      coach: { select: { id: true, user: { select: { name: true } } } },
      outcomeNote: { select: { body: true } },
      clientPackage: {
        select: {
          expiresAt: true,
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
    },
  });
}

// Per-day session tallies for the month grid, keyed by KL date ("2026-07-25").
// The same actor scoping and optional manager coach-narrow as the day view
// apply — a coach's grid only ever counts their own sessions. Bucketing happens
// in KL wall time here rather than in SQL, to reuse the one offset constant the
// rest of the app already trusts. `toMark` is the count of past sessions still
// SCHEDULED — the days that owe attendance, surfaced on the calendar.
export type DayTally = { count: number; toMark: number };

export async function getMonthCountsForActor(
  actor: Actor,
  window: { from: Date; to: Date },
  narrowCoachId?: string,
): Promise<Record<string, DayTally>> {
  const narrow =
    narrowCoachId && actor.role !== Role.COACH ? { coachId: narrowCoachId } : {};
  const sessions = await prisma.trainingSession.findMany({
    where: {
      ...scopeWhere(actor),
      ...narrow,
      scheduledAt: { gte: window.from, lt: window.to },
    },
    select: { scheduledAt: true, status: true },
  });

  const now = Date.now();
  const tallies: Record<string, DayTally> = {};
  for (const s of sessions) {
    const key = klDateKey(s.scheduledAt);
    const tally = (tallies[key] ??= { count: 0, toMark: 0 });
    tally.count += 1;
    if (s.status === "SCHEDULED" && s.scheduledAt.getTime() < now) {
      tally.toMark += 1;
    }
  }
  return tallies;
}

// null (not a throw) for an out-of-scope session id, so the caller answers
// notFound() without leaking that the session exists.
export async function getSessionForActor(actor: Actor, sessionId: string) {
  return prisma.trainingSession.findFirst({
    where: { id: sessionId, ...scopeWhere(actor) },
    select: listSelect,
  });
}
