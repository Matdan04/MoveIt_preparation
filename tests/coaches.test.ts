import { describe, it, expect, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createCoach,
  updateCoach,
  setCoachActive,
  deleteCoach,
} from "@/lib/services/coaches";

// The coach roster invariants: a coach is a User + Coach created and torn down
// together; deactivation is reversible and flips both the profile and the login;
// and a coach with any history can never be hard-deleted — only deactivated —
// so the domain chain and the audit trail are never left dangling.

let seq = 0;

// A real manager to attribute audit rows to — every mutation writes one and
// AuditLog.actorUserId is a foreign key, so the actor must exist.
let actor: string;
beforeEach(async () => {
  const passwordHash = await hashPassword("x");
  const user = await prisma.user.create({
    data: {
      email: `mgr-${seq++}-${crypto.randomUUID()}@x`,
      name: "Manager",
      passwordHash,
      role: Role.MANAGER,
    },
  });
  actor = user.id;
});

function makeInput(overrides: Partial<Parameters<typeof createCoach>[0]> = {}) {
  return {
    name: "New Coach",
    email: `coach-${seq++}-${crypto.randomUUID()}@x`,
    password: "supersecret",
    specialties: ["Strength", "Mobility"],
    weeklyCapacityHours: 20,
    actorUserId: actor,
    ...overrides,
  };
}

describe("createCoach", () => {
  it("creates the login User and the Coach profile together", async () => {
    const input = makeInput();
    const coach = await createCoach(input);

    const user = await prisma.user.findUnique({
      where: { id: (await prisma.coach.findUniqueOrThrow({ where: { id: coach.id } })).userId },
    });
    expect(user?.role).toBe(Role.COACH);
    expect(user?.email).toBe(input.email.toLowerCase());
    expect(coach.specialties).toEqual(["Strength", "Mobility"]);
    // The password is stored hashed, never in the clear.
    expect(user?.passwordHash).not.toBe(input.password);
    expect(await verifyPassword(input.password, user!.passwordHash)).toBe(true);
  });

  it("drops blank specialties from a half-filled form", async () => {
    const coach = await createCoach(
      makeInput({ specialties: ["Rehab", "  ", ""] }),
    );
    expect(coach.specialties).toEqual(["Rehab"]);
  });

  it("rejects a duplicate email", async () => {
    const email = `dupe-${crypto.randomUUID()}@x`;
    await createCoach(makeInput({ email }));
    await expect(createCoach(makeInput({ email }))).rejects.toThrow(/already exists/i);
  });

  it("writes one audit row without a passwordHash", async () => {
    const coach = await createCoach(makeInput());
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "Coach", entityId: coach.id, action: "CREATE_COACH" },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log?.after)).not.toContain("passwordHash");
  });
});

describe("updateCoach", () => {
  it("updates the name on the User and the profile on the Coach", async () => {
    const coach = await createCoach(makeInput());
    await updateCoach({
      coachId: coach.id,
      name: "Renamed Coach",
      specialties: ["Endurance"],
      weeklyCapacityHours: 30,
      actorUserId: actor,
    });
    const updated = await prisma.coach.findUniqueOrThrow({
      where: { id: coach.id },
      include: { user: true },
    });
    expect(updated.user.name).toBe("Renamed Coach");
    expect(updated.specialties).toEqual(["Endurance"]);
    expect(updated.weeklyCapacityHours).toBe(30);
  });
});

describe("setCoachActive", () => {
  it("deactivation flips both the Coach and the login, reversibly", async () => {
    const coach = await createCoach(makeInput());

    await setCoachActive(coach.id, false, actor);
    let row = await prisma.coach.findUniqueOrThrow({
      where: { id: coach.id },
      include: { user: true },
    });
    expect(row.active).toBe(false);
    expect(row.user.isActive).toBe(false);

    await setCoachActive(coach.id, true, actor);
    row = await prisma.coach.findUniqueOrThrow({
      where: { id: coach.id },
      include: { user: true },
    });
    expect(row.active).toBe(true);
    expect(row.user.isActive).toBe(true);
  });

  it("reports active clients stranded by a deactivation, without blocking", async () => {
    const coach = await createCoach(makeInput());
    const client = await prisma.client.create({
      data: { name: "Client", phone: `+6012${String(seq++).padStart(7, "0")}` },
    });
    await prisma.coachAssignment.create({
      data: { clientId: client.id, coachId: coach.id },
    });

    const { strandedClients } = await setCoachActive(coach.id, false, actor);
    expect(strandedClients).toBe(1);
    // Deactivation still succeeds — the count is advisory.
    expect(
      (await prisma.coach.findUniqueOrThrow({ where: { id: coach.id } })).active,
    ).toBe(false);
  });
});

describe("deleteCoach", () => {
  it("hard-deletes a coach with no history, taking the login with it", async () => {
    const coach = await createCoach(makeInput());
    const { userId } = await prisma.coach.findUniqueOrThrow({
      where: { id: coach.id },
    });

    await deleteCoach(coach.id, actor);

    expect(await prisma.coach.findUnique({ where: { id: coach.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    // The removal is still traceable even though the row is gone.
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "Coach", entityId: coach.id, action: "DELETE_COACH" },
    });
    expect(log).not.toBeNull();
  });

  it("refuses to delete a coach that has any history", async () => {
    const coach = await createCoach(makeInput());
    const client = await prisma.client.create({
      data: { name: "Client", phone: `+6012${String(seq++).padStart(7, "0")}` },
    });
    await prisma.coachAssignment.create({
      data: { clientId: client.id, coachId: coach.id },
    });

    await expect(deleteCoach(coach.id, actor)).rejects.toThrow(/deactivate/i);
    // Nothing was removed.
    expect(
      await prisma.coach.findUnique({ where: { id: coach.id } }),
    ).not.toBeNull();
  });
});
