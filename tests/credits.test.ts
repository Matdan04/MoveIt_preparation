import { describe, it, expect } from "vitest";
import { Role, TrainingSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  getBalance,
  grantOpeningCredits,
  settleSession,
  adjustCredits,
  reverseEntry,
  creditDeltaForOutcome,
  NO_SHOW_WINDOW_MS,
} from "@/lib/services/credits";

// The ledger's guarantee is that a balance is only ever the sum of its rows.
// These tests exercise each credit rule end to end against a real Postgres,
// then push on the two hard parts: idempotent settlement and the behaviour
// under two concurrent marks of the same session.

const HOUR = 60 * 60 * 1000;

type Fixture = Awaited<ReturnType<typeof setup>>;

async function setup() {
  const passwordHash = await hashPassword("x");

  const manager = await prisma.user.create({
    data: { email: "m@x", name: "Manager", passwordHash, role: Role.MANAGER },
  });
  const coachUser = await prisma.user.create({
    data: {
      email: "c@x",
      name: "Coach",
      passwordHash,
      role: Role.COACH,
      coach: { create: { specialties: [], weeklyCapacityHours: 20 } },
    },
    include: { coach: true },
  });
  const coach = coachUser.coach!;

  const client = await prisma.client.create({
    data: { name: "Client", phone: "+60120000001" },
  });
  const pkg = await prisma.package.create({
    data: { name: "10 PT", sessionCount: 10, priceSen: 100000, validityDays: 90 },
  });
  const clientPackage = await prisma.clientPackage.create({
    data: {
      clientId: client.id,
      packageId: pkg.id,
      expiresAt: new Date(Date.now() + 90 * 24 * HOUR),
      creditsGranted: 10,
    },
  });

  return { managerId: manager.id, coachId: coach.id, clientId: client.id, clientPackageId: clientPackage.id };
}

// A training session with a given schedule and status, so settlement has a real
// row to lock and link against.
async function makeSession(
  f: Fixture,
  scheduledAt: Date,
  status: TrainingSessionStatus = TrainingSessionStatus.SCHEDULED,
) {
  return prisma.trainingSession.create({
    data: {
      clientId: f.clientId,
      coachId: f.coachId,
      clientPackageId: f.clientPackageId,
      scheduledAt,
      durationMin: 60,
      status,
    },
  });
}

describe("credit ledger", () => {
  it("derives the balance as the sum of ledger rows, starting from the grant", async () => {
    const f = await setup();
    expect(await getBalance(f.clientPackageId)).toBe(0);

    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    expect(await getBalance(f.clientPackageId)).toBe(10);
  });

  it("deducts one credit when a session is marked attended", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const session = await makeSession(f, new Date());

    await settleSession({
      clientPackageId: f.clientPackageId,
      trainingSessionId: session.id,
      status: TrainingSessionStatus.ATTENDED,
      scheduledAt: session.scheduledAt,
      actorUserId: f.managerId,
    });

    expect(await getBalance(f.clientPackageId)).toBe(9);
  });

  it("charges a no-show inside the 12-hour window", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const scheduledAt = new Date();
    const session = await makeSession(f, scheduledAt);

    await settleSession({
      clientPackageId: f.clientPackageId,
      trainingSessionId: session.id,
      status: TrainingSessionStatus.NO_SHOW,
      scheduledAt,
      actorUserId: f.managerId,
      decidedAt: scheduledAt,
    });

    expect(await getBalance(f.clientPackageId)).toBe(9);
  });

  it("does not charge a no-show recorded outside the 12-hour window", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const scheduledAt = new Date(Date.now() + 24 * HOUR);
    const session = await makeSession(f, scheduledAt);

    await settleSession({
      clientPackageId: f.clientPackageId,
      trainingSessionId: session.id,
      status: TrainingSessionStatus.NO_SHOW,
      scheduledAt,
      actorUserId: f.managerId,
      decidedAt: new Date(),
    });

    expect(await getBalance(f.clientPackageId)).toBe(10);
  });

  it("never charges a studio cancellation", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const scheduledAt = new Date();
    const session = await makeSession(f, scheduledAt);

    await settleSession({
      clientPackageId: f.clientPackageId,
      trainingSessionId: session.id,
      status: TrainingSessionStatus.CANCELLED_BY_STUDIO,
      scheduledAt,
      actorUserId: f.managerId,
      decidedAt: scheduledAt,
    });

    expect(await getBalance(f.clientPackageId)).toBe(10);
  });

  it("charges a client cancellation inside the window", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const scheduledAt = new Date(Date.now() + 6 * HOUR);
    const session = await makeSession(f, scheduledAt);

    await settleSession({
      clientPackageId: f.clientPackageId,
      trainingSessionId: session.id,
      status: TrainingSessionStatus.CANCELLED_BY_CLIENT,
      scheduledAt,
      actorUserId: f.managerId,
      decidedAt: new Date(),
    });

    expect(await getBalance(f.clientPackageId)).toBe(9);
  });

  it("does not charge a client cancellation outside the window", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const scheduledAt = new Date(Date.now() + 24 * HOUR);
    const session = await makeSession(f, scheduledAt);

    await settleSession({
      clientPackageId: f.clientPackageId,
      trainingSessionId: session.id,
      status: TrainingSessionStatus.CANCELLED_BY_CLIENT,
      scheduledAt,
      actorUserId: f.managerId,
      decidedAt: new Date(),
    });

    expect(await getBalance(f.clientPackageId)).toBe(10);
  });

  it("applies a manager's manual adjustment with any delta", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });

    await adjustCredits({
      clientPackageId: f.clientPackageId,
      delta: 3,
      reason: "Goodwill comp for a double-booked slot.",
      actorUserId: f.managerId,
    });

    expect(await getBalance(f.clientPackageId)).toBe(13);
  });

  it("rejects a manual adjustment with a blank reason", async () => {
    const f = await setup();
    await expect(
      adjustCredits({ clientPackageId: f.clientPackageId, delta: -1, reason: "   ", actorUserId: f.managerId }),
    ).rejects.toThrow(/non-empty reason/);
    expect(await getBalance(f.clientPackageId)).toBe(0);
  });

  it("reverses an entry with a compensating row, restoring the balance", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const entry = await adjustCredits({
      clientPackageId: f.clientPackageId,
      delta: -5,
      reason: "Charged in error.",
      actorUserId: f.managerId,
    });
    expect(await getBalance(f.clientPackageId)).toBe(5);

    await reverseEntry({ entryId: entry.id, reason: "Reversing the erroneous charge.", actorUserId: f.managerId });

    expect(await getBalance(f.clientPackageId)).toBe(10);
    // Append-only: the original charge is still on record, not deleted.
    const rows = await prisma.creditLedgerEntry.count({ where: { clientPackageId: f.clientPackageId } });
    expect(rows).toBe(3);
  });

  it("reports a balance from the ledger even when the package has expired", async () => {
    const f = await setup();
    // Push the package's validity into the past — expiry is a booking concern,
    // not a ledger one, so the balance is unaffected.
    await prisma.clientPackage.update({
      where: { id: f.clientPackageId },
      data: { expiresAt: new Date(Date.now() - 24 * HOUR) },
    });
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const session = await makeSession(f, new Date());
    await settleSession({
      clientPackageId: f.clientPackageId,
      trainingSessionId: session.id,
      status: TrainingSessionStatus.ATTENDED,
      scheduledAt: session.scheduledAt,
      actorUserId: f.managerId,
    });

    expect(await getBalance(f.clientPackageId)).toBe(9);
  });

  it("settles a session only once when marked attended twice", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const session = await makeSession(f, new Date());

    const first = await settleSession({
      clientPackageId: f.clientPackageId,
      trainingSessionId: session.id,
      status: TrainingSessionStatus.ATTENDED,
      scheduledAt: session.scheduledAt,
      actorUserId: f.managerId,
    });
    const second = await settleSession({
      clientPackageId: f.clientPackageId,
      trainingSessionId: session.id,
      status: TrainingSessionStatus.ATTENDED,
      scheduledAt: session.scheduledAt,
      actorUserId: f.managerId,
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull(); // already settled — no second row
    expect(await getBalance(f.clientPackageId)).toBe(9);
  });

  // The bait question from the playbook. Honest scope of this test: it fires
  // two marks of the same session at once and asserts a single deduction. It is
  // NOT a deterministic race reproducer — two in-process transactions rarely
  // interleave their reads, so this passes even with the lock removed; it would
  // catch a regression only intermittently. The single-deduction GUARANTEE is
  // structural, not from this test: the FOR UPDATE row lock in settleSession
  // serialises settlements of the same session, so the loser blocks and then
  // sees the entry and no-ops. Without it, two truly-overlapping transactions
  // under READ COMMITTED would each read "not settled" and both insert (-2);
  // a partial unique index on the settlement row or SERIALIZABLE isolation
  // would close the same gap.
  it("deducts exactly one credit under two concurrent attendance markings", async () => {
    const f = await setup();
    await grantOpeningCredits({ clientPackageId: f.clientPackageId, credits: 10, actorUserId: f.managerId });
    const session = await makeSession(f, new Date());

    const mark = () =>
      settleSession({
        clientPackageId: f.clientPackageId,
        trainingSessionId: session.id,
        status: TrainingSessionStatus.ATTENDED,
        scheduledAt: session.scheduledAt,
        actorUserId: f.managerId,
      });

    const results = await Promise.all([mark(), mark()]);

    const settledRows = results.filter((r) => r !== null);
    expect(settledRows).toHaveLength(1);
    expect(await getBalance(f.clientPackageId)).toBe(9);
  });
});

describe("creditDeltaForOutcome (pure rule)", () => {
  it("treats the window boundary as inside (12h before start is still charged)", () => {
    const scheduledAt = new Date();
    const atBoundary = new Date(scheduledAt.getTime() - NO_SHOW_WINDOW_MS);
    expect(creditDeltaForOutcome(TrainingSessionStatus.NO_SHOW, scheduledAt, atBoundary)).toBe(-1);

    const justOutside = new Date(scheduledAt.getTime() - NO_SHOW_WINDOW_MS - 1);
    expect(creditDeltaForOutcome(TrainingSessionStatus.NO_SHOW, scheduledAt, justOutside)).toBe(0);
  });
});
