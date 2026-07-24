import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/services/audit";
import { assignCoach } from "@/lib/services/assignments";
import { adjustCredits, grantOpeningCredits } from "@/lib/services/credits";

// The audit log's contract: an actor-initiated mutation leaves exactly one row,
// attributed to the actor, carrying a diff you could act on — and never a
// secret, even if a caller hands one to the choke point.

let seq = 0;

async function makeManager() {
  const passwordHash = await hashPassword("x");
  return prisma.user.create({
    data: {
      email: `mgr-${seq++}-${crypto.randomUUID()}@x`,
      name: "Manager",
      passwordHash,
      role: Role.MANAGER,
    },
  });
}

async function makeCoach() {
  const passwordHash = await hashPassword("x");
  const user = await prisma.user.create({
    data: {
      email: `coach-${seq++}-${crypto.randomUUID()}@x`,
      name: `Coach ${seq}`,
      passwordHash,
      role: Role.COACH,
      coach: { create: { specialties: [], weeklyCapacityHours: 20 } },
    },
    include: { coach: true },
  });
  return user.coach!;
}

describe("audit log", () => {
  it("records a coach reassignment as one row with the actor and a coach-to-coach diff", async () => {
    const manager = await makeManager();
    const client = await prisma.client.create({
      data: { name: "Client", phone: "+60120000001" },
    });
    const first = await makeCoach();
    const second = await makeCoach();

    await assignCoach({ clientId: client.id, coachId: first.id, actorUserId: manager.id });
    await assignCoach({
      clientId: client.id,
      coachId: second.id,
      actorUserId: manager.id,
      reason: "client requested a change",
    });

    const rows = await prisma.auditLog.findMany({
      where: { entityType: "CoachAssignment", action: "REASSIGN" },
    });
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.actorUserId).toBe(manager.id);
    // The diff is usable: it names the coach left behind and the coach taken on.
    expect((row.before as { coachId: string }).coachId).toBe(first.id);
    expect((row.after as { coachId: string }).coachId).toBe(second.id);
  });

  it("records a manual credit adjustment as one row with the actor and the delta", async () => {
    const manager = await makeManager();
    const client = await prisma.client.create({
      data: { name: "Client", phone: "+60120000002" },
    });
    const pkg = await prisma.package.create({
      data: { name: "10 PT", sessionCount: 10, priceSen: 100000, validityDays: 90 },
    });
    const cp = await prisma.clientPackage.create({
      data: {
        clientId: client.id,
        packageId: pkg.id,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        creditsGranted: 10,
      },
    });
    // The opening grant writes a ledger row but no audit row — it is routine, and
    // the ledger is its own trail. Only the discretionary adjustment is audited.
    await grantOpeningCredits({ clientPackageId: cp.id, credits: 10, actorUserId: manager.id });

    await adjustCredits({
      clientPackageId: cp.id,
      delta: 3,
      reason: "Goodwill comp.",
      actorUserId: manager.id,
    });

    const rows = await prisma.auditLog.findMany({
      where: { entityType: "CreditLedgerEntry", action: "ADJUST_CREDITS" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].actorUserId).toBe(manager.id);
    expect((rows[0].after as { delta: number; reason: string }).delta).toBe(3);
    expect((rows[0].after as { delta: number; reason: string }).reason).toBe("Goodwill comp.");
  });

  it("strips passwordHash from any snapshot before it is stored", async () => {
    const manager = await makeManager();

    await prisma.$transaction((tx) =>
      recordAudit(tx, {
        actorUserId: manager.id,
        entityType: "User",
        entityId: manager.id,
        action: "TEST_REDACTION",
        before: { id: manager.id, name: "Manager", passwordHash: "super-secret" },
        after: { id: manager.id, name: "Manager", passwordHash: "super-secret" },
      }),
    );

    const row = await prisma.auditLog.findFirst({
      where: { action: "TEST_REDACTION" },
    });
    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain("super-secret");
    expect((row!.before as Record<string, unknown>).passwordHash).toBeUndefined();
    expect((row!.after as Record<string, unknown>).name).toBe("Manager");
  });
});
