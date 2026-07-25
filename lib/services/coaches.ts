// The coach roster as a staffing record. A coach is two rows that must stay in
// lockstep: a User (role COACH, the login identity) and a Coach (specialties,
// weekly capacity, active flag). This service owns keeping them consistent —
// creating both together, editing the pair as one, and deactivating both at
// once — while a Server Action asserts the actor may manage coaches
// (assertCanManageCoaches) before delegating here.
//
// Two rules shape the destructive paths:
//   - Deactivation is the everyday off-boarding, and it is reversible. It flips
//     Coach.active AND User.isActive together, so a former coach can neither be
//     assigned new clients nor log in, while every session, note and assignment
//     they ever had stays intact and readable.
//   - Hard deletion is only for a coach added by mistake — one with no history
//     at all. A coach who has ever coached a session, written a note, or held an
//     assignment can never be deleted, only deactivated, so the audit trail and
//     the domain chain are never left dangling.

import type { Coach, Prisma } from "@prisma/client";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/services/audit";

type Tx = Prisma.TransactionClient;

// Trim and drop empties so a specialty list never carries blank chips from a
// half-filled form.
function cleanSpecialties(specialties: string[]): string[] {
  return specialties.map((s) => s.trim()).filter((s) => s.length > 0);
}

export type CreateCoachInput = {
  name: string;
  email: string;
  password: string;
  specialties: string[];
  weeklyCapacityHours: number;
  actorUserId: string;
};

// Onboard a coach: create the login User and the Coach profile in one
// transaction so a half-made coach (a User with no Coach, or the reverse) can
// never exist. Email uniqueness is enforced by the User unique index; we
// pre-check for a friendly message and let the constraint be the race backstop.
export async function createCoach(input: CreateCoachInput): Promise<Coach> {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("A user with that email already exists.");

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash,
        role: Role.COACH,
        coach: {
          create: {
            specialties: cleanSpecialties(input.specialties),
            weeklyCapacityHours: input.weeklyCapacityHours,
          },
        },
      },
      include: { coach: true },
    });
    // The coach relation is created in the same call, so it is always present.
    const coach = user.coach!;

    // Audited as a create keyed to the Coach; `after` is the safe projection,
    // never the User row (which would carry the hash — recordAudit redacts it,
    // but we simply do not put it here).
    await recordAudit(tx, {
      actorUserId: input.actorUserId,
      entityType: "Coach",
      entityId: coach.id,
      action: "CREATE_COACH",
      after: {
        name: user.name,
        email: user.email,
        specialties: coach.specialties,
        weeklyCapacityHours: coach.weeklyCapacityHours,
        active: coach.active,
      },
    });
    return coach;
  });
}

export type UpdateCoachInput = {
  coachId: string;
  name: string;
  specialties: string[];
  weeklyCapacityHours: number;
  actorUserId: string;
};

// Edit a coach's profile: the display name lives on the User, the specialties
// and capacity on the Coach, and both move in one transaction. Email and role
// are deliberately not editable here — changing a login identity is a heavier
// operation than a profile edit and out of scope for this slice.
export async function updateCoach(input: UpdateCoachInput): Promise<Coach> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.coach.findUnique({
      where: { id: input.coachId },
      select: {
        specialties: true,
        weeklyCapacityHours: true,
        user: { select: { name: true } },
      },
    });
    if (!before) throw new Error("Coach not found.");

    const coach = await tx.coach.update({
      where: { id: input.coachId },
      data: {
        specialties: cleanSpecialties(input.specialties),
        weeklyCapacityHours: input.weeklyCapacityHours,
        user: { update: { name: input.name.trim() } },
      },
    });

    await recordAudit(tx, {
      actorUserId: input.actorUserId,
      entityType: "Coach",
      entityId: coach.id,
      action: "UPDATE_COACH",
      before: {
        name: before.user.name,
        specialties: before.specialties,
        weeklyCapacityHours: before.weeklyCapacityHours,
      },
      after: {
        name: input.name.trim(),
        specialties: coach.specialties,
        weeklyCapacityHours: coach.weeklyCapacityHours,
      },
    });
    return coach;
  });
}

export type SetCoachActiveResult = {
  coach: Coach;
  // Active clients still assigned when a coach is deactivated — surfaced so the
  // manager knows to reassign them, never a block.
  strandedClients: number;
};

// Deactivate or reactivate a coach. Flips Coach.active and the login's
// User.isActive together, so the two never drift. Deactivating leaves the
// coach's active client assignments untouched (closing them is the manager's
// explicit reassignment decision, not a side effect of off-boarding) but
// reports how many there are so nothing is stranded silently.
export async function setCoachActive(
  coachId: string,
  active: boolean,
  actorUserId: string,
): Promise<SetCoachActiveResult> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.coach.findUnique({
      where: { id: coachId },
      select: { active: true, userId: true },
    });
    if (!before) throw new Error("Coach not found.");

    const coach = await tx.coach.update({
      where: { id: coachId },
      data: {
        active,
        user: { update: { isActive: active } },
      },
    });

    const strandedClients = active
      ? 0
      : await tx.coachAssignment.count({
          where: { coachId, endedAt: null },
        });

    await recordAudit(tx, {
      actorUserId,
      entityType: "Coach",
      entityId: coachId,
      action: active ? "REACTIVATE_COACH" : "DEACTIVATE_COACH",
      before: { active: before.active },
      after: { active },
    });

    return { coach, strandedClients };
  });
}

// Permanently remove a coach who was added in error. Only a coach with NO
// history — no training sessions, no outcome notes, no assignments past or
// present — may be deleted; anything else must be deactivated so the record it
// is attached to keeps a valid coach. Deleting the Coach also removes its User
// (cascading the login and any sessions), which is why the empty-history guard
// is a hard precondition, not a convenience.
export async function deleteCoach(
  coachId: string,
  actorUserId: string,
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const coach = await tx.coach.findUnique({
      where: { id: coachId },
      select: {
        userId: true,
        specialties: true,
        weeklyCapacityHours: true,
        user: { select: { name: true, email: true } },
        _count: {
          select: {
            assignments: true,
            trainingSessions: true,
            outcomeNotes: true,
          },
        },
      },
    });
    if (!coach) throw new Error("Coach not found.");

    const { assignments, trainingSessions, outcomeNotes } = coach._count;
    if (assignments + trainingSessions + outcomeNotes > 0) {
      throw new Error(
        "This coach has history and cannot be deleted. Deactivate them instead.",
      );
    }

    // Record the removal BEFORE the delete, inside the same transaction, so the
    // audit row survives even though the Coach row will not. entityId still
    // points at the id that existed, for a reader tracing the roster's history.
    await recordAudit(tx, {
      actorUserId,
      entityType: "Coach",
      entityId: coachId,
      action: "DELETE_COACH",
      before: {
        name: coach.user.name,
        email: coach.user.email,
        specialties: coach.specialties,
        weeklyCapacityHours: coach.weeklyCapacityHours,
      },
    });

    // Deleting the User cascades to the Coach (Coach.user onDelete: Cascade),
    // taking the login and the now-orphan-free profile in one go.
    await tx.user.delete({ where: { id: coach.userId } });
  });
}
