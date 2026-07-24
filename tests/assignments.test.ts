import { describe, it, expect, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { assignCoach } from "@/lib/services/assignments";

// The assignment invariants: reassigning closes exactly one prior active row and
// opens exactly one new one; the partial unique index holds even under a race;
// history reads back newest-first; and capacity is advisory — it warns with a
// number, it never blocks.

let seq = 0;

async function makeCoach(weeklyCapacityHours = 20, active = true) {
  const passwordHash = await hashPassword("x");
  const user = await prisma.user.create({
    data: {
      email: `coach-${seq++}-${crypto.randomUUID()}@x`,
      name: `Coach ${seq}`,
      passwordHash,
      role: Role.COACH,
      coach: { create: { specialties: [], weeklyCapacityHours, active } },
    },
    include: { coach: true },
  });
  return user.coach!;
}

function makeClient(name = "Client") {
  return prisma.client.create({
    data: { name, phone: `+6012${String(seq++).padStart(7, "0")}` },
  });
}

async function activeAssignments(clientId: string) {
  return prisma.coachAssignment.findMany({
    where: { clientId, endedAt: null },
  });
}

// A real manager to attribute the audit rows to — assignCoach now writes one,
// and AuditLog.actorUserId is a foreign key, so the actor must exist.
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

describe("coach assignment", () => {
  it("opens a first assignment with no prior history", async () => {
    const client = await makeClient();
    const coach = await makeCoach();

    const { assignment } = await assignCoach({
      clientId: client.id,
      coachId: coach.id,
      actorUserId: actor,
    });

    expect(assignment.coachId).toBe(coach.id);
    expect(assignment.endedAt).toBeNull();
    expect((await activeAssignments(client.id)).length).toBe(1);
  });

  it("closes exactly one prior assignment when reassigning", async () => {
    const client = await makeClient();
    const first = await makeCoach();
    const second = await makeCoach();

    await assignCoach({ clientId: client.id, coachId: first.id, actorUserId: actor });
    await assignCoach({
      clientId: client.id,
      coachId: second.id,
      actorUserId: actor,
      reason: "client requested a different coach",
    });

    // Exactly one active row, and it points at the new coach.
    const active = await activeAssignments(client.id);
    expect(active.length).toBe(1);
    expect(active[0].coachId).toBe(second.id);

    // Exactly one closed row, stamped with endedAt and the reassignment reason.
    const closed = await prisma.coachAssignment.findMany({
      where: { clientId: client.id, endedAt: { not: null } },
    });
    expect(closed.length).toBe(1);
    expect(closed[0].coachId).toBe(first.id);
    expect(closed[0].reason).toBe("client requested a different coach");
  });

  it("is a no-op when reassigning to the same coach", async () => {
    const client = await makeClient();
    const coach = await makeCoach();

    const first = await assignCoach({
      clientId: client.id,
      coachId: coach.id,
      actorUserId: actor,
    });
    const again = await assignCoach({
      clientId: client.id,
      coachId: coach.id,
      actorUserId: actor,
    });

    expect(again.assignment.id).toBe(first.assignment.id);
    // No churn: still a single row, none closed.
    expect(await prisma.coachAssignment.count({ where: { clientId: client.id } })).toBe(1);
  });

  it("rejects a second active assignment for one client at the database", async () => {
    const client = await makeClient();
    const a = await makeCoach();
    const b = await makeCoach();

    // The service closes the prior row before opening a new one, so it never
    // trips the index in normal use. This drives the index directly — the
    // backstop that keeps "one active coach" true even if a racing writer or a
    // bad manual write skipped the close — by forcing two open rows for one
    // client and asserting the database refuses the second.
    await assignCoach({ clientId: client.id, coachId: a.id, actorUserId: actor });
    await expect(
      prisma.coachAssignment.create({
        data: { clientId: client.id, coachId: b.id },
      }),
    ).rejects.toThrow(/CoachAssignment_one_active_per_client|Unique constraint/);

    expect((await activeAssignments(client.id)).length).toBe(1);
  });

  it("reads assignment history back newest-first", async () => {
    const client = await makeClient();
    const first = await makeCoach();
    const second = await makeCoach();
    const third = await makeCoach();

    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-02-01T00:00:00Z");
    const t2 = new Date("2026-03-01T00:00:00Z");
    await assignCoach({ clientId: client.id, coachId: first.id, actorUserId: actor }, t0);
    await assignCoach({ clientId: client.id, coachId: second.id, actorUserId: actor }, t1);
    await assignCoach({ clientId: client.id, coachId: third.id, actorUserId: actor }, t2);

    const history = await prisma.coachAssignment.findMany({
      where: { clientId: client.id },
      orderBy: { startedAt: "desc" },
    });
    expect(history.map((h) => h.coachId)).toEqual([third.id, second.id, first.id]);
  });

  it("warns with the projected load when an assignment exceeds capacity", async () => {
    // Capacity of one standing hour; the second active client tips it over.
    const coach = await makeCoach(1);
    const c1 = await makeClient("One");
    const c2 = await makeClient("Two");

    const under = await assignCoach({ clientId: c1.id, coachId: coach.id, actorUserId: actor });
    expect(under.capacityWarning).toBeNull();

    const over = await assignCoach({ clientId: c2.id, coachId: coach.id, actorUserId: actor });
    expect(over.capacityWarning).toEqual({ weeklyCapacityHours: 1, projectedHours: 2 });
  });

  it("refuses to assign a client to an inactive coach", async () => {
    const client = await makeClient();
    const coach = await makeCoach(20, false);

    await expect(
      assignCoach({ clientId: client.id, coachId: coach.id, actorUserId: actor }),
    ).rejects.toThrow(/inactive/);
  });
});
