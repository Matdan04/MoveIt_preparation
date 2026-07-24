// Coach assignment: which coach owns a client, and the full history of that
// relationship over time. Like the other services, this module owns the domain
// invariants, not authorization — a Server Action asserts the actor may manage
// assignments (assertCanManageAssignments) before delegating here.
//
// Two rules shape everything below:
//   - A client has at most one active assignment. Reassigning closes the open
//     one and opens the new one in a single transaction, and the database's
//     partial unique index (clientId WHERE endedAt IS NULL) is the ultimate
//     backstop: even a racing double-reassign can only ever leave one active row.
//   - Capacity is advisory, never a gate. Pushing a coach over their weekly
//     capacity warns and surfaces the projected load; it does not block. Staffing
//     reality (a busy week, a temporary cover) is the manager's call, not the
//     system's.

import type { CoachAssignment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient;

// We have no per-client hours field, so we model each active client as one
// standing weekly training hour — the typical PT cadence of a single recurring
// slot. A coach's committed load is therefore their active client count, which
// is what an assignment actually changes. This is the one assumption behind the
// capacity warning; change this constant if the studio's cadence differs.
const WEEKLY_HOURS_PER_ACTIVE_CLIENT = 1;

export type CapacityWarning = {
  weeklyCapacityHours: number;
  // Projected committed hours once this assignment stands — the number the
  // manager sees so they can decide with eyes open.
  projectedHours: number;
};

export type AssignmentResult = {
  assignment: CoachAssignment;
  // Null unless this assignment pushes the coach past their weekly capacity.
  capacityWarning: CapacityWarning | null;
};

export type AssignCoachInput = {
  clientId: string;
  coachId: string;
  actorUserId: string;
  // Why the client is being (re)assigned. Recorded on the assignment that this
  // action CLOSES, so the history reads as a chain of "coach X ended because…".
  reason?: string;
};

// Assign a coach to a client. If the client already has an active coach, that
// assignment is closed (endedAt + reason) and a fresh one opened, atomically, so
// the client is never left with zero or two active coaches. Reassigning to the
// same coach is a deliberate no-op — it would only churn history — and returns
// the existing assignment untouched.
export async function assignCoach(
  input: AssignCoachInput,
  now: Date = new Date(),
): Promise<AssignmentResult> {
  const assignment = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: input.clientId },
      select: { id: true },
    });
    if (!client) throw new Error("Client not found.");

    const coach = await tx.coach.findUnique({
      where: { id: input.coachId },
      select: { active: true },
    });
    if (!coach) throw new Error("Coach not found.");
    if (!coach.active) {
      throw new Error("Cannot assign a client to an inactive coach.");
    }

    const current = await tx.coachAssignment.findFirst({
      where: { clientId: input.clientId, endedAt: null },
    });

    // Already this coach: leave history alone rather than close-and-reopen an
    // identical pairing.
    if (current && current.coachId === input.coachId) return current;

    if (current) {
      await tx.coachAssignment.update({
        where: { id: current.id },
        data: { endedAt: now, reason: input.reason },
      });
    }

    // The partial unique index guarantees this insert fails if a concurrent
    // transaction opened an active assignment for the same client between our
    // read above and this write — the atomicity that keeps "one active coach"
    // true under races.
    return tx.coachAssignment.create({
      data: {
        clientId: input.clientId,
        coachId: input.coachId,
        startedAt: now,
      },
    });
  });

  const capacityWarning = await computeCapacityWarning(input.coachId);
  return { assignment, capacityWarning };
}

// The projected weekly load for a coach, warned only when it exceeds capacity.
// Read after the assignment commits, so the count already reflects the new row.
async function computeCapacityWarning(
  coachId: string,
  db: Tx | typeof prisma = prisma,
): Promise<CapacityWarning | null> {
  const coach = await db.coach.findUnique({
    where: { id: coachId },
    select: { weeklyCapacityHours: true },
  });
  if (!coach) return null;

  const activeClients = await db.coachAssignment.count({
    where: { coachId, endedAt: null },
  });
  const projectedHours = activeClients * WEEKLY_HOURS_PER_ACTIVE_CLIENT;

  return projectedHours > coach.weeklyCapacityHours
    ? { weeklyCapacityHours: coach.weeklyCapacityHours, projectedHours }
    : null;
}
