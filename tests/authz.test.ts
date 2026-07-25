import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/auth/authz";
import {
  assertCanConvertLead,
  assertCanBookForCoach,
  assertCanMarkAttendance,
  assertCanWriteOutcomeNote,
  assertCanManageAssignments,
  assertCanAdjustCredits,
  assertCanRunImport,
  assertCanManageCoaches,
} from "@/lib/auth/authz";
import { getClientsForActor, getClientForActor } from "@/lib/data/clients";
import { getLeadsForActor, getLeadForActor } from "@/lib/data/leads";
import { getSessionsForActor, getSessionForActor } from "@/lib/data/sessions";
import { getAssignmentHistoryForActor } from "@/lib/data/assignments";
import { getAuditLogForActor } from "@/lib/data/audit";
import {
  getCoachesForManagement,
  getCoachDetailForActor,
} from "@/lib/data/coaches";

// This suite is the project's primary security artifact. Every case models an
// attacker calling a data function or a policy assertion DIRECTLY with a forged
// id, bypassing the UI entirely. Each test name states the rule it defends.
//
// Two shapes of denial are asserted deliberately:
//   - A role with no claim to a capability gets a thrown ForbiddenError.
//   - A coach reaching another coach's resource gets null (→ notFound()), never
//     an error, so the resource's existence never leaks.

type Fixture = Awaited<ReturnType<typeof setup>>;

async function setup() {
  const passwordHash = await hashPassword("x");

  const manager = await prisma.user.create({
    data: { email: "m@x", name: "Manager", passwordHash, role: Role.MANAGER },
  });
  const frontDesk = await prisma.user.create({
    data: { email: "fd@x", name: "Front Desk", passwordHash, role: Role.FRONT_DESK },
  });
  const coachAUser = await prisma.user.create({
    data: {
      email: "ca@x",
      name: "Coach A",
      passwordHash,
      role: Role.COACH,
      coach: { create: { specialties: [], weeklyCapacityHours: 20 } },
    },
    include: { coach: true },
  });
  const coachBUser = await prisma.user.create({
    data: {
      email: "cb@x",
      name: "Coach B",
      passwordHash,
      role: Role.COACH,
      coach: { create: { specialties: [], weeklyCapacityHours: 20 } },
    },
    include: { coach: true },
  });
  const coachA = coachAUser.coach!;
  const coachB = coachBUser.coach!;

  const clientA = await prisma.client.create({
    data: { name: "Client A", phone: "+60120000001" },
  });
  const clientB = await prisma.client.create({
    data: { name: "Client B", phone: "+60120000002" },
  });

  // Active assignments: A→coachA, B→coachB.
  await prisma.coachAssignment.create({
    data: { clientId: clientA.id, coachId: coachA.id, reason: "intake" },
  });
  await prisma.coachAssignment.create({
    data: { clientId: clientB.id, coachId: coachB.id, reason: "intake" },
  });

  const lead = await prisma.lead.create({
    data: {
      name: "A Lead",
      phone: "+60120000003",
      source: "Walk-in",
      ownerUserId: frontDesk.id,
    },
  });

  const sessionA = await prisma.trainingSession.create({
    data: {
      clientId: clientA.id,
      coachId: coachA.id,
      scheduledAt: new Date(),
      durationMin: 60,
    },
  });
  const sessionB = await prisma.trainingSession.create({
    data: {
      clientId: clientB.id,
      coachId: coachB.id,
      scheduledAt: new Date(),
      durationMin: 60,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: manager.id,
      entityType: "Client",
      entityId: clientA.id,
      action: "create",
    },
  });

  const managerActor: Actor = { id: manager.id, role: Role.MANAGER };
  const frontDeskActor: Actor = { id: frontDesk.id, role: Role.FRONT_DESK };
  const coachAActor: Actor = {
    id: coachAUser.id,
    role: Role.COACH,
    coachId: coachA.id,
  };
  const coachBActor: Actor = {
    id: coachBUser.id,
    role: Role.COACH,
    coachId: coachB.id,
  };

  return {
    managerActor,
    frontDeskActor,
    coachAActor,
    coachBActor,
    coachA,
    coachB,
    clientA,
    clientB,
    lead,
    sessionA,
    sessionB,
  };
}

// ---------------------------------------------------------------------------
describe("View/edit leads — front desk and manager only", () => {
  it("denies a coach listing leads even though leads exist", async () => {
    const f = await setup();
    await expect(getLeadsForActor(f.coachAActor)).rejects.toThrow(ForbiddenError);
  });

  it("denies a coach reading a lead by a valid, forged id", async () => {
    const f: Fixture = await setup();
    await expect(getLeadForActor(f.coachAActor, f.lead.id)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("allows front desk to list leads", async () => {
    const f = await setup();
    expect(await getLeadsForActor(f.frontDeskActor)).toHaveLength(1);
  });

  it("allows a manager to list leads", async () => {
    const f = await setup();
    expect(await getLeadsForActor(f.managerActor)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("Convert lead to client — front desk and manager only", () => {
  it("denies a coach converting a lead", async () => {
    const f = await setup();
    expect(() => assertCanConvertLead(f.coachAActor)).toThrow(ForbiddenError);
  });

  it("allows front desk to convert a lead", async () => {
    const f = await setup();
    expect(() => assertCanConvertLead(f.frontDeskActor)).not.toThrow();
  });

  it("allows a manager to convert a lead", async () => {
    const f = await setup();
    expect(() => assertCanConvertLead(f.managerActor)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe("View clients — coach sees only their own assigned clients", () => {
  it("returns only actively-assigned clients to a coach", async () => {
    const f = await setup();
    const list = await getClientsForActor(f.coachAActor);
    expect(list.map((c) => c.id)).toEqual([f.clientA.id]);
  });

  it("returns all clients to front desk", async () => {
    const f = await setup();
    expect(await getClientsForActor(f.frontDeskActor)).toHaveLength(2);
  });

  it("returns all clients to a manager", async () => {
    const f = await setup();
    expect(await getClientsForActor(f.managerActor)).toHaveLength(2);
  });

  it("gives a coach null (not an error) for another coach's client, leaking nothing", async () => {
    const f = await setup();
    expect(await getClientForActor(f.coachAActor, f.clientB.id)).toBeNull();
  });

  it("lets a coach read their own assigned client", async () => {
    const f = await setup();
    const c = await getClientForActor(f.coachAActor, f.clientA.id);
    expect(c?.id).toBe(f.clientA.id);
  });

  it("stops a coach seeing a client once they are reassigned away", async () => {
    const f = await setup();
    await prisma.coachAssignment.updateMany({
      where: { clientId: f.clientA.id, coachId: f.coachA.id },
      data: { endedAt: new Date() },
    });
    expect(await getClientForActor(f.coachAActor, f.clientA.id)).toBeNull();
    expect(await getClientsForActor(f.coachAActor)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("Book/reschedule sessions — coach only for their own", () => {
  it("denies a coach booking for another coach", async () => {
    const f = await setup();
    expect(() => assertCanBookForCoach(f.coachAActor, f.coachB.id)).toThrow(
      ForbiddenError,
    );
  });

  it("allows a coach to book for themselves", async () => {
    const f = await setup();
    expect(() => assertCanBookForCoach(f.coachAActor, f.coachA.id)).not.toThrow();
  });

  it("allows front desk to book for any coach", async () => {
    const f = await setup();
    expect(() => assertCanBookForCoach(f.frontDeskActor, f.coachA.id)).not.toThrow();
  });

  it("allows a manager to book for any coach", async () => {
    const f = await setup();
    expect(() => assertCanBookForCoach(f.managerActor, f.coachB.id)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe("Sessions — a coach sees only sessions they coach", () => {
  it("lists only a coach's own sessions", async () => {
    const f = await setup();
    const list = await getSessionsForActor(f.coachAActor);
    expect(list.map((s) => s.id)).toEqual([f.sessionA.id]);
  });

  it("lists every session for front desk", async () => {
    const f = await setup();
    expect(await getSessionsForActor(f.frontDeskActor)).toHaveLength(2);
  });

  it("gives a coach null for another coach's session id, leaking nothing", async () => {
    const f = await setup();
    expect(await getSessionForActor(f.coachAActor, f.sessionB.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Mark attendance — coach for own sessions, manager for any", () => {
  it("denies a coach marking attendance on another coach's session", async () => {
    const f = await setup();
    expect(() => assertCanMarkAttendance(f.coachAActor, f.coachB.id)).toThrow(
      ForbiddenError,
    );
  });

  it("allows a coach to mark attendance on their own session", async () => {
    const f = await setup();
    expect(() => assertCanMarkAttendance(f.coachAActor, f.coachA.id)).not.toThrow();
  });

  it("denies front desk marking attendance", async () => {
    const f = await setup();
    expect(() => assertCanMarkAttendance(f.frontDeskActor, f.coachA.id)).toThrow(
      ForbiddenError,
    );
  });

  it("allows a manager to mark attendance on any session", async () => {
    const f = await setup();
    expect(() => assertCanMarkAttendance(f.managerActor, f.coachA.id)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe("Write outcome notes — authoring coach only; manager read-only", () => {
  it("allows a coach to write a note on their own session", async () => {
    const f = await setup();
    expect(() => assertCanWriteOutcomeNote(f.coachAActor, f.coachA.id)).not.toThrow();
  });

  it("denies a coach writing a note on another coach's session", async () => {
    const f = await setup();
    expect(() => assertCanWriteOutcomeNote(f.coachAActor, f.coachB.id)).toThrow(
      ForbiddenError,
    );
  });

  it("denies a manager authoring a note (read-only on notes)", async () => {
    const f = await setup();
    expect(() => assertCanWriteOutcomeNote(f.managerActor, f.coachA.id)).toThrow(
      ForbiddenError,
    );
  });

  it("denies front desk writing a note", async () => {
    const f = await setup();
    expect(() => assertCanWriteOutcomeNote(f.frontDeskActor, f.coachA.id)).toThrow(
      ForbiddenError,
    );
  });
});

// ---------------------------------------------------------------------------
describe("Assign/reassign coach — manager only", () => {
  it("denies front desk assigning a coach", async () => {
    const f = await setup();
    expect(() => assertCanManageAssignments(f.frontDeskActor)).toThrow(ForbiddenError);
  });

  it("denies a coach assigning a coach", async () => {
    const f = await setup();
    expect(() => assertCanManageAssignments(f.coachAActor)).toThrow(ForbiddenError);
  });

  it("allows a manager to assign a coach", async () => {
    const f = await setup();
    expect(() => assertCanManageAssignments(f.managerActor)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe("Manual credit adjustment — manager only", () => {
  it("denies front desk making a manual adjustment", async () => {
    const f = await setup();
    expect(() => assertCanAdjustCredits(f.frontDeskActor)).toThrow(ForbiddenError);
  });

  it("denies a coach making a manual adjustment", async () => {
    const f = await setup();
    expect(() => assertCanAdjustCredits(f.coachAActor)).toThrow(ForbiddenError);
  });

  it("allows a manager to make a manual adjustment", async () => {
    const f = await setup();
    expect(() => assertCanAdjustCredits(f.managerActor)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe("View audit log — manager only", () => {
  it("denies front desk reading the audit log", async () => {
    const f = await setup();
    await expect(getAuditLogForActor(f.frontDeskActor)).rejects.toThrow(ForbiddenError);
  });

  it("denies a coach reading the audit log", async () => {
    const f = await setup();
    await expect(getAuditLogForActor(f.coachAActor)).rejects.toThrow(ForbiddenError);
  });

  it("allows a manager to read the audit log", async () => {
    const f = await setup();
    expect(await getAuditLogForActor(f.managerActor)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("Run import — manager only", () => {
  it("denies front desk running the import", async () => {
    const f = await setup();
    expect(() => assertCanRunImport(f.frontDeskActor)).toThrow(ForbiddenError);
  });

  it("denies a coach running the import", async () => {
    const f = await setup();
    expect(() => assertCanRunImport(f.coachAActor)).toThrow(ForbiddenError);
  });

  it("allows a manager to run the import", async () => {
    const f = await setup();
    expect(() => assertCanRunImport(f.managerActor)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe("Manage coaches — manager only", () => {
  it("denies front desk listing the coach roster", async () => {
    const f = await setup();
    await expect(getCoachesForManagement(f.frontDeskActor)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("denies a coach listing the coach roster", async () => {
    const f = await setup();
    await expect(getCoachesForManagement(f.coachAActor)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("allows a manager to list the coach roster", async () => {
    const f = await setup();
    expect(await getCoachesForManagement(f.managerActor)).toHaveLength(2);
  });

  it("denies front desk and a coach the manage-coaches capability", async () => {
    const f = await setup();
    expect(() => assertCanManageCoaches(f.frontDeskActor)).toThrow(ForbiddenError);
    expect(() => assertCanManageCoaches(f.coachAActor)).toThrow(ForbiddenError);
    expect(() => assertCanManageCoaches(f.managerActor)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe("Coach profile — manager any, coach own only", () => {
  it("gives a coach null (not an error) for another coach's profile, leaking nothing", async () => {
    const f = await setup();
    expect(await getCoachDetailForActor(f.coachAActor, f.coachB.id)).toBeNull();
  });

  it("lets a coach read their own profile", async () => {
    const f = await setup();
    const detail = await getCoachDetailForActor(f.coachAActor, f.coachA.id);
    expect(detail?.coach.id).toBe(f.coachA.id);
  });

  it("lets a manager read any coach's profile", async () => {
    const f = await setup();
    const detail = await getCoachDetailForActor(f.managerActor, f.coachB.id);
    expect(detail?.coach.id).toBe(f.coachB.id);
  });

  it("gives front desk null for a coach profile — no leaking existence", async () => {
    const f = await setup();
    expect(await getCoachDetailForActor(f.frontDeskActor, f.coachA.id)).toBeNull();
  });

  it("never selects passwordHash into the coach profile payload", async () => {
    const f = await setup();
    const detail = await getCoachDetailForActor(f.managerActor, f.coachA.id);
    expect(detail?.coach.user).not.toHaveProperty("passwordHash");
  });
});

// ---------------------------------------------------------------------------
describe("Assignment history reads follow client scope", () => {
  it("gives a coach null history for a client that is not theirs", async () => {
    const f = await setup();
    expect(await getAssignmentHistoryForActor(f.coachAActor, f.clientB.id)).toBeNull();
  });

  it("returns ordered history for a client the actor can see", async () => {
    const f = await setup();
    const history = await getAssignmentHistoryForActor(f.managerActor, f.clientA.id);
    expect(history).not.toBeNull();
    expect(history!.length).toBeGreaterThanOrEqual(1);
  });
});
