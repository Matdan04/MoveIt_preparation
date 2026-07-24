// The session lifecycle: booking, rescheduling, and the terminal outcomes that
// settle credit. This service owns the domain invariants; it does NOT own
// authorization. As with credits.ts, a Server Action asserts the actor may act
// (assertCanBookForCoach / assertCanMarkAttendance) before delegating here —
// this module is the mechanism, not the policy.
//
// Two rules shape everything below:
//   - State transitions are explicit. There is no "set status to X" entry point
//     an action could call with an arbitrary string; the only ways out of
//     SCHEDULED are the named functions here, each pinned to one outcome.
//   - Credit movement is never duplicated. Settlement runs through the ledger's
//     idempotent settleSession, and re-applying the same outcome is a no-op, so
//     marking a session attended twice deducts exactly once.

import type { Prisma, TrainingSession } from "@prisma/client";
import { TrainingSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { getBalance, settleSession } from "@/lib/services/credits";

type Tx = Prisma.TransactionClient;

// A client package can back a booking only if its validity still covers the
// session date and it has credits left to spend. Expiry is checked against the
// session's scheduled time, not "now": a package valid today but expiring before
// the booked date cannot pay for that date.
async function findEligiblePackage(
  tx: Tx,
  clientId: string,
  scheduledAt: Date,
): Promise<string | null> {
  // Soonest-expiring first, so a client burns down the package that would lapse
  // next rather than stranding credits on it.
  const candidates = await tx.clientPackage.findMany({
    where: { clientId, expiresAt: { gt: scheduledAt } },
    orderBy: { expiresAt: "asc" },
    select: { id: true },
  });

  for (const candidate of candidates) {
    if ((await getBalance(candidate.id, tx)) > 0) return candidate.id;
  }
  return null;
}

// True if [aStart, aEnd) and [bStart, bEnd) share any instant. Half-open, so a
// session ending exactly when the next begins is not an overlap.
function overlaps(
  aStart: Date,
  aDurationMin: number,
  bStart: Date,
  bDurationMin: number,
): boolean {
  const aEnd = aStart.getTime() + aDurationMin * 60_000;
  const bEnd = bStart.getTime() + bDurationMin * 60_000;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}

// Does the coach already hold a SCHEDULED session clashing with this slot?
// Only live bookings block — a cancelled or completed session frees the slot.
// `excludeId` lets a reschedule ignore the row it is moving.
async function coachHasOverlap(
  tx: Tx,
  coachId: string,
  scheduledAt: Date,
  durationMin: number,
  excludeId?: string,
): Promise<boolean> {
  const slotEnd = new Date(scheduledAt.getTime() + durationMin * 60_000);
  // Narrow in SQL to sessions that could start before this one ends, then apply
  // the exact half-open overlap in JS because each row's end depends on its own
  // durationMin — awkward to express as a single indexable predicate.
  const candidates = await tx.trainingSession.findMany({
    where: {
      coachId,
      status: TrainingSessionStatus.SCHEDULED,
      scheduledAt: { lt: slotEnd },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { scheduledAt: true, durationMin: true },
  });
  return candidates.some((c) =>
    overlaps(scheduledAt, durationMin, c.scheduledAt, c.durationMin),
  );
}

export type BookSessionInput = {
  clientId: string;
  coachId: string;
  scheduledAt: Date;
  durationMin: number;
  actorUserId: string;
  // Optional: pin the package to charge. Omit to auto-select the soonest-expiring
  // eligible one. A supplied id is still re-validated for eligibility below.
  clientPackageId?: string;
};

// Book a session after checking every booking invariant in one transaction: the
// slot is in the future, the coach is free, and the client has an eligible
// package to pay with. No credit moves at booking — a credit is only spent when
// the session reaches a terminal outcome.
export async function bookSession(
  input: BookSessionInput,
  now: Date = new Date(),
): Promise<TrainingSession> {
  if (input.durationMin <= 0) {
    throw new Error("A session must have a positive duration.");
  }
  if (input.scheduledAt.getTime() <= now.getTime()) {
    throw new Error("A session must be scheduled in the future.");
  }

  return prisma.$transaction(async (tx) => {
    // The overlap check and the insert share a transaction so a concurrent
    // booking cannot slip a clashing row in between them at SERIALIZABLE; under
    // the default READ COMMITTED a narrow TOCTOU window remains, called out in
    // the README's failure modes.
    if (
      await coachHasOverlap(tx, input.coachId, input.scheduledAt, input.durationMin)
    ) {
      throw new Error("The coach already has a session overlapping that slot.");
    }

    const clientPackageId =
      input.clientPackageId ??
      (await findEligiblePackage(tx, input.clientId, input.scheduledAt));
    if (!clientPackageId) {
      throw new Error(
        "The client has no package with remaining credits valid for that date.",
      );
    }
    // A caller-supplied package id is untrusted: confirm it belongs to this
    // client, still covers the date, and has credits, rather than trusting it.
    if (input.clientPackageId) {
      const pkg = await tx.clientPackage.findFirst({
        where: {
          id: input.clientPackageId,
          clientId: input.clientId,
          expiresAt: { gt: input.scheduledAt },
        },
        select: { id: true },
      });
      if (!pkg || (await getBalance(input.clientPackageId, tx)) <= 0) {
        throw new Error(
          "The chosen package cannot back this booking (wrong client, expired, or no credits).",
        );
      }
    }

    const created = await tx.trainingSession.create({
      data: {
        clientId: input.clientId,
        coachId: input.coachId,
        clientPackageId,
        scheduledAt: input.scheduledAt,
        durationMin: input.durationMin,
        status: TrainingSessionStatus.SCHEDULED,
      },
    });
    await recordAudit(tx, {
      actorUserId: input.actorUserId,
      entityType: "TrainingSession",
      entityId: created.id,
      action: "BOOK_SESSION",
      after: created,
    });
    return created;
  });
}

export type RescheduleInput = {
  sessionId: string;
  scheduledAt: Date;
  actorUserId: string;
  durationMin?: number;
};

// Move a session to a new slot in place. The row's id is preserved (an update,
// never delete-and-recreate) so every credit entry, note, and audit reference
// still points at the same session. Only a SCHEDULED session can move; a
// completed or cancelled one is history. The before/after is captured by the
// audit log wired in Step 8 — this is the "records the change" seam.
export async function rescheduleSession(
  input: RescheduleInput,
  now: Date = new Date(),
): Promise<TrainingSession> {
  if (input.scheduledAt.getTime() <= now.getTime()) {
    throw new Error("A session must be rescheduled to a future time.");
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.trainingSession.findUnique({
      where: { id: input.sessionId },
    });
    if (!session) throw new Error("Session not found.");
    if (session.status !== TrainingSessionStatus.SCHEDULED) {
      throw new Error(
        `Cannot reschedule a session that is ${session.status}.`,
      );
    }

    const durationMin = input.durationMin ?? session.durationMin;
    if (durationMin <= 0) {
      throw new Error("A session must have a positive duration.");
    }
    if (
      await coachHasOverlap(
        tx,
        session.coachId,
        input.scheduledAt,
        durationMin,
        session.id,
      )
    ) {
      throw new Error("The coach already has a session overlapping that slot.");
    }

    const updated = await tx.trainingSession.update({
      where: { id: session.id },
      data: { scheduledAt: input.scheduledAt, durationMin },
    });
    // The before/after here is the "records the change" seam the reschedule
    // contract calls for — the old slot and the new one, same session id.
    await recordAudit(tx, {
      actorUserId: input.actorUserId,
      entityType: "TrainingSession",
      entityId: session.id,
      action: "RESCHEDULE_SESSION",
      before: session,
      after: updated,
    });
    return updated;
  });
}

// The only path from SCHEDULED to a terminal state. Kept private so callers must
// go through the named wrappers below — an action can never assign a free-form
// status. Idempotent: re-applying the outcome a session already holds returns it
// untouched with no second settlement; attempting a DIFFERENT terminal outcome
// on an already-settled session is rejected and names the transition.
async function applyOutcome(
  params: {
    sessionId: string;
    status: TrainingSessionStatus;
    actorUserId: string;
    decidedAt?: Date;
  },
): Promise<TrainingSession> {
  return prisma.$transaction(async (tx) => {
    // Lock the row so two concurrent marks serialise: the loser blocks here,
    // then sees the outcome already applied and no-ops. This mirrors the lock in
    // settleSession and is what makes double-marking safe at the session level,
    // not just the ledger level.
    await tx.$queryRaw`SELECT id FROM "TrainingSession" WHERE id = ${params.sessionId} FOR UPDATE`;

    const session = await tx.trainingSession.findUnique({
      where: { id: params.sessionId },
    });
    if (!session) throw new Error("Session not found.");

    // Already in the requested terminal state: idempotent no-op. The settlement
    // row was written by the first call; do not write another.
    if (session.status === params.status) return session;

    if (session.status !== TrainingSessionStatus.SCHEDULED) {
      throw new Error(
        `Cannot change a session from ${session.status} to ${params.status}.`,
      );
    }

    const updated = await tx.trainingSession.update({
      where: { id: session.id },
      data: { status: params.status },
    });

    // One row for the outcome the actor chose. The credit movement it triggers
    // is recorded by the ledger entry settleSession writes below, not a second
    // audit row — the outcome and its settlement are one action.
    await recordAudit(tx, {
      actorUserId: params.actorUserId,
      entityType: "TrainingSession",
      entityId: session.id,
      action: `OUTCOME_${params.status}`,
      before: session,
      after: updated,
    });

    // Settle credit only when a package backs the session. A studio cancellation
    // moves 0 anyway; a booking always carries a package, so this guards only
    // legacy/imported rows that never had one.
    if (session.clientPackageId) {
      await settleSession(
        {
          clientPackageId: session.clientPackageId,
          trainingSessionId: session.id,
          status: params.status,
          scheduledAt: session.scheduledAt,
          actorUserId: params.actorUserId,
          decidedAt: params.decidedAt,
        },
        tx,
      );
    }

    return updated;
  });
}

// The four named terminal transitions. Each fixes the status, so no caller ever
// supplies one; the credit consequence follows from the ledger's rules.

export function markAttended(
  params: { sessionId: string; actorUserId: string; decidedAt?: Date },
): Promise<TrainingSession> {
  return applyOutcome({ ...params, status: TrainingSessionStatus.ATTENDED });
}

export function markNoShow(
  params: { sessionId: string; actorUserId: string; decidedAt?: Date },
): Promise<TrainingSession> {
  return applyOutcome({ ...params, status: TrainingSessionStatus.NO_SHOW });
}

export function cancelByClient(
  params: { sessionId: string; actorUserId: string; decidedAt?: Date },
): Promise<TrainingSession> {
  return applyOutcome({
    ...params,
    status: TrainingSessionStatus.CANCELLED_BY_CLIENT,
  });
}

export function cancelByStudio(
  params: { sessionId: string; actorUserId: string; decidedAt?: Date },
): Promise<TrainingSession> {
  return applyOutcome({
    ...params,
    status: TrainingSessionStatus.CANCELLED_BY_STUDIO,
  });
}
