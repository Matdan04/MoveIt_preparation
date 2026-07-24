import { describe, it, expect } from "vitest";
import { Role, TrainingSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getBalance, grantOpeningCredits } from "@/lib/services/credits";
import {
  bookSession,
  rescheduleSession,
  markAttended,
  markNoShow,
  cancelByStudio,
} from "@/lib/services/sessions";

// The lifecycle invariants: booking rejects a past slot, an ineligible client,
// and an overlapping coach; rescheduling keeps the id; and a terminal outcome
// settles credit exactly once even when applied twice.

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
  // A fresh package only has a balance once the opening grant is posted.
  await grantOpeningCredits({
    clientPackageId: clientPackage.id,
    credits: 10,
    actorUserId: manager.id,
  });

  return {
    managerId: manager.id,
    coachId: coach.id,
    clientId: client.id,
    clientPackageId: clientPackage.id,
    packageId: pkg.id,
  };
}

describe("session booking", () => {
  it("books a future session against an eligible package without moving credit", async () => {
    const f = await setup();
    const session = await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: new Date(Date.now() + 24 * HOUR),
      durationMin: 60,
      actorUserId: f.managerId,
    });

    expect(session.status).toBe(TrainingSessionStatus.SCHEDULED);
    expect(session.clientPackageId).toBe(f.clientPackageId);
    // Booking moves no credit — the grant is untouched.
    expect(await getBalance(f.clientPackageId)).toBe(10);
  });

  it("rejects a session scheduled in the past", async () => {
    const f = await setup();
    await expect(
      bookSession({
        clientId: f.clientId,
        coachId: f.coachId,
        scheduledAt: new Date(Date.now() - HOUR),
        durationMin: 60,
        actorUserId: f.managerId,
      }),
    ).rejects.toThrow(/future/);
  });

  it("rejects booking when the client has no eligible package", async () => {
    const f = await setup();
    // Expire the only package before the session date.
    await prisma.clientPackage.update({
      where: { id: f.clientPackageId },
      data: { expiresAt: new Date(Date.now() + HOUR) },
    });
    await expect(
      bookSession({
        clientId: f.clientId,
        coachId: f.coachId,
        scheduledAt: new Date(Date.now() + 48 * HOUR),
        durationMin: 60,
        actorUserId: f.managerId,
      }),
    ).rejects.toThrow(/no package/);
  });

  it("rejects a booking that overlaps another of the coach's sessions", async () => {
    const f = await setup();
    const start = new Date(Date.now() + 24 * HOUR);
    await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: start,
      durationMin: 60,
      actorUserId: f.managerId,
    });

    // Starts 30 minutes into the first hour-long session — a clash.
    await expect(
      bookSession({
        clientId: f.clientId,
        coachId: f.coachId,
        scheduledAt: new Date(start.getTime() + 30 * 60_000),
        durationMin: 60,
        actorUserId: f.managerId,
      }),
    ).rejects.toThrow(/overlapping/);
  });

  it("allows a back-to-back booking that starts exactly when the prior ends", async () => {
    const f = await setup();
    const start = new Date(Date.now() + 24 * HOUR);
    await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: start,
      durationMin: 60,
      actorUserId: f.managerId,
    });

    const next = await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: new Date(start.getTime() + 60 * 60_000),
      durationMin: 60,
      actorUserId: f.managerId,
    });
    expect(next.status).toBe(TrainingSessionStatus.SCHEDULED);
  });
});

describe("session rescheduling", () => {
  it("moves a session while preserving its id", async () => {
    const f = await setup();
    const session = await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: new Date(Date.now() + 24 * HOUR),
      durationMin: 60,
      actorUserId: f.managerId,
    });

    const target = new Date(Date.now() + 48 * HOUR);
    const moved = await rescheduleSession({
      sessionId: session.id,
      scheduledAt: target,
      actorUserId: f.managerId,
    });

    expect(moved.id).toBe(session.id);
    expect(moved.scheduledAt.getTime()).toBe(target.getTime());
  });

  it("refuses to reschedule a session that is no longer scheduled", async () => {
    const f = await setup();
    const session = await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: new Date(Date.now() + 24 * HOUR),
      durationMin: 60,
      actorUserId: f.managerId,
    });
    await markAttended({ sessionId: session.id, actorUserId: f.managerId });

    await expect(
      rescheduleSession({
        sessionId: session.id,
        scheduledAt: new Date(Date.now() + 72 * HOUR),
        actorUserId: f.managerId,
      }),
    ).rejects.toThrow(/Cannot reschedule/);
  });
});

describe("session outcomes", () => {
  it("deducts exactly one credit when a session is marked attended", async () => {
    const f = await setup();
    const session = await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: new Date(Date.now() + 24 * HOUR),
      durationMin: 60,
      actorUserId: f.managerId,
    });

    const marked = await markAttended({
      sessionId: session.id,
      actorUserId: f.managerId,
    });

    expect(marked.status).toBe(TrainingSessionStatus.ATTENDED);
    expect(await getBalance(f.clientPackageId)).toBe(9);
  });

  it("is idempotent: marking attended twice deducts only once", async () => {
    const f = await setup();
    const session = await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: new Date(Date.now() + 24 * HOUR),
      durationMin: 60,
      actorUserId: f.managerId,
    });

    await markAttended({ sessionId: session.id, actorUserId: f.managerId });
    await markAttended({ sessionId: session.id, actorUserId: f.managerId });

    expect(await getBalance(f.clientPackageId)).toBe(9);
    const rows = await prisma.creditLedgerEntry.count({
      where: { trainingSessionId: session.id },
    });
    expect(rows).toBe(1);
  });

  it("refuses to change a session that is already terminal", async () => {
    const f = await setup();
    const session = await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: new Date(Date.now() + 24 * HOUR),
      durationMin: 60,
      actorUserId: f.managerId,
    });
    await markAttended({ sessionId: session.id, actorUserId: f.managerId });

    await expect(
      markNoShow({ sessionId: session.id, actorUserId: f.managerId }),
    ).rejects.toThrow(/Cannot change a session from ATTENDED to NO_SHOW/);
  });

  it("frees the slot for rebooking once a session is cancelled", async () => {
    const f = await setup();
    const start = new Date(Date.now() + 24 * HOUR);
    const first = await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: start,
      durationMin: 60,
      actorUserId: f.managerId,
    });
    await cancelByStudio({ sessionId: first.id, actorUserId: f.managerId });

    // A cancelled session no longer blocks the coach's slot.
    const replacement = await bookSession({
      clientId: f.clientId,
      coachId: f.coachId,
      scheduledAt: start,
      durationMin: 60,
      actorUserId: f.managerId,
    });
    expect(replacement.status).toBe(TrainingSessionStatus.SCHEDULED);
    // Studio cancellation charges nothing.
    expect(await getBalance(f.clientPackageId)).toBe(10);
  });
});
