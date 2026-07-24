import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  createBatch,
  stageClients,
  stageBookings,
  stagePackages,
} from "@/lib/import/stage";
import { reconcileClients } from "@/lib/import/reconcile";
import {
  reconcileBookings,
  reconcilePackages,
} from "@/lib/import/reconcile-refs";
import type {
  ClientMatch,
  ClientConflict,
} from "@/lib/import/reconcile";
import { commitImport } from "@/lib/import/commit";
import { computeDiscrepancies } from "@/lib/import/parallel-check";
import { getBalance } from "@/lib/services/credits";

const SOURCE = "legacy-booking-tool";

// Phases 1 and 2 of the vendor import, exercised against the REAL dirty fixture
// files in sample_vendor_export/. The point of these tests is to pin specific
// rows to specific reconciliation outcomes by name, so a future change to the
// matcher that reclassifies a client fails loudly here.

const EXPORT_DIR = join(process.cwd(), "sample_vendor_export");
const read = (f: string) => readFileSync(join(EXPORT_DIR, f), "utf8");

// The live book the vendor export is reconciled against. Phones are the E.164
// forms the fixtures collide with; a handful of the messy rows deliberately do
// not correspond to anyone here.
async function seedLiveBook() {
  const passwordHash = await hashPassword("x");

  const live = [
    ["Nurul Ain binti Rahman", "+60120000100"],
    ["Tan Wei Ming", "+60120000101"],
    ["Kavitha Subramaniam", "+60120000102"],
    ["Ahmad Faizal bin Hassan", "+60120000103"],
    ["Lim Xin Yi", "+60120000104"],
    ["Emily Watson", "+60120000110"],
    ["James O'Connor", "+60120000113"],
    ["Deepa Ramasamy", "+60120000122"],
    ["Chloe Lim", "+60120000124"],
  ] as const;
  for (const [name, phone] of live) {
    await prisma.client.create({ data: { name, phone } });
  }

  // The package catalogue the importer keys onto by session count.
  await prisma.package.createMany({
    data: [
      { name: "Trial 3-Pack", sessionCount: 3, priceSen: 45_000, validityDays: 30 },
      { name: "PT 10-Pack", sessionCount: 10, priceSen: 180_000, validityDays: 90 },
      { name: "PT 20-Pack", sessionCount: 20, priceSen: 340_000, validityDays: 180 },
    ],
  });

  const coaches = ["Adam Lim Wei Jie", "Farah Aziz", "Rajesh Kumar"];
  for (let i = 0; i < coaches.length; i++) {
    await prisma.user.create({
      data: {
        email: `coach${i}@x`,
        name: coaches[i],
        passwordHash,
        role: Role.COACH,
        coach: { create: { specialties: [], weeklyCapacityHours: 20 } },
      },
    });
  }
}

async function stageFixtures(): Promise<string> {
  const batchId = await createBatch(SOURCE);
  await stageClients(batchId, read("clients.csv"));
  await stageBookings(batchId, read("bookings.csv"));
  await stagePackages(batchId, read("packages.csv"));
  return batchId;
}

async function aManager(): Promise<string> {
  const passwordHash = await hashPassword("x");
  const m = await prisma.user.create({
    data: { email: "mgr@x", name: "Manager", passwordHash, role: Role.MANAGER },
  });
  return m.id;
}

// Stage the fixtures, reconcile, and commit the unambiguous outcomes.
async function stageReconcileCommit() {
  const batchId = await stageFixtures();
  const report = await reconcileClients(batchId);
  const actorUserId = await aManager();
  const summary = await commitImport({
    batchId,
    sourceSystem: SOURCE,
    report,
    actorUserId,
  });
  return { batchId, report, summary };
}

// Find the bucket entry that contains a given vendor Member ID.
const byRow = <T extends { sourceRowIds: string[] }>(rows: T[], id: string) =>
  rows.find((r) => r.sourceRowIds.includes(id));

describe("vendor import — phase 1 staging", () => {
  beforeEach(seedLiveBook);

  it("stages every client row without letting a bad row abort the file", async () => {
    const batchId = await stageFixtures();
    const staged = await prisma.stagingClient.count({ where: { batchId } });
    expect(staged).toBe(15); // every row in clients.csv, dirt and all
  });

  it("records the letter-for-zero phone as a parse error, not a crash", async () => {
    const batchId = await stageFixtures();
    const wong = await prisma.stagingClient.findFirstOrThrow({
      where: { batchId, sourceRowId: "V1009" },
    });
    expect(wong.normalizedPhone).toBeNull();
    expect(wong.parseErrors.join(" ")).toMatch(/phone/i);
  });

  it("tolerates a missing joined date without erroring the row", async () => {
    const batchId = await stageFixtures();
    const deepa = await prisma.stagingClient.findFirstOrThrow({
      where: { batchId, sourceRowId: "V1015" },
    });
    expect(deepa.normalizedPhone).toBe("+60120000122");
    expect(deepa.joinedAt).toBeNull();
    expect(deepa.parseErrors).toEqual([]);
  });

  it("never writes a live client while staging", async () => {
    const before = await prisma.client.count();
    await stageFixtures();
    const after = await prisma.client.count();
    expect(after).toBe(before);
  });
});

describe("vendor import — phase 2 client reconciliation", () => {
  beforeEach(seedLiveBook);

  it("folds the three Nurul Ain cards into one exact match on the shared phone", async () => {
    const batchId = await stageFixtures();
    const report = await reconcileClients(batchId);

    const nurul = byRow(report.exactMatches, "V1001") as ClientMatch;
    expect(nurul).toBeDefined();
    expect(nurul.sourceRowIds.sort()).toEqual(["V1001", "V1002", "V1003"]);
    expect(nurul.liveClientName).toBe("Nurul Ain binti Rahman");
  });

  it("matches abbreviated and reformatted rows to live clients by phone", async () => {
    const batchId = await stageFixtures();
    const report = await reconcileClients(batchId);
    const ids = report.exactMatches.flatMap((m) => m.sourceRowIds);
    // Kavitha S., Tan Wei Ming, Ahmad (spaced), James (no apostrophe),
    // Chloe, Deepa (leading space + spaced phone).
    for (const id of ["V1004", "V1005", "V1006", "V1008", "V1014", "V1015"]) {
      expect(ids).toContain(id);
    }
  });

  it("keeps a phone-less row as a probable match on the name, never exact", async () => {
    const batchId = await stageFixtures();
    const report = await reconcileClients(batchId);

    const emily = byRow(report.probableMatches, "V1007") as ClientMatch;
    expect(emily).toBeDefined();
    expect(emily.liveClientName).toBe("Emily Watson");
    expect(emily.normalizedPhone).toBeNull();
    expect(byRow(report.exactMatches, "V1007")).toBeUndefined();
  });

  it("flags two people sharing one phone as a conflict and merges neither", async () => {
    const batchId = await stageFixtures();
    const report = await reconcileClients(batchId);

    const conflict = report.conflicts.find(
      (c: ClientConflict) =>
        c.sourceRowIds.includes("V1012") && c.sourceRowIds.includes("V1013"),
    );
    expect(conflict).toBeDefined();
    expect(conflict!.normalizedPhone).toBe("+60120000104");
    // Neither shared-phone row is silently matched anywhere else.
    expect(byRow(report.exactMatches, "V1013")).toBeUndefined();
    expect(byRow(report.probableMatches, "V1013")).toBeUndefined();
  });

  it("routes members with no live counterpart to new clients", async () => {
    const batchId = await stageFixtures();
    const report = await reconcileClients(batchId);
    const ids = report.newClients.flatMap((m) => m.sourceRowIds);
    expect(ids).toContain("V1010"); // Sarah, +60120000199
    expect(ids).toContain("V1011"); // Ravi Chandran, 0120000200
  });

  it("sends an unparseable-phone row to errors, not to a name-only match", async () => {
    const batchId = await stageFixtures();
    const report = await reconcileClients(batchId);
    const wong = report.errors.find((e) => e.sourceRowId === "V1009");
    expect(wong).toBeDefined();
    expect(wong!.vendorName).toBe("Wong Jia Hui");
  });
});

describe("vendor import — phase 2 booking and package integrity", () => {
  beforeEach(seedLiveBook);

  it("reports a booking for a missing member as an orphan", async () => {
    const batchId = await stageFixtures();
    const report = await reconcileBookings(batchId);
    expect(report.unknownMember.map((i) => i.sourceRowId)).toContain("B2007");
  });

  it("reports coach strings that match no coach record", async () => {
    const batchId = await stageFixtures();
    const report = await reconcileBookings(batchId);
    const ids = report.unknownCoach.map((i) => i.sourceRowId);
    expect(ids).toContain("B2006"); // "Coach Mike"
    expect(ids).toContain("B2008"); // "Kenny"
  });

  it("detects the overlapping bookings for one coach", async () => {
    const batchId = await stageFixtures();
    const report = await reconcileBookings(batchId);
    expect(report.overlaps.length).toBeGreaterThan(0);
    const involved = report.overlaps.map((i) => i.sourceRowId);
    expect(involved).toContain("B2001");
  });

  it("reports a package for a member with no client row as an orphan", async () => {
    const batchId = await stageFixtures();
    const report = await reconcilePackages(batchId);
    expect(report.unknownMember.map((i) => i.sourceRowId)).toContain("V1099");
  });
});

describe("vendor import — phase 3 commit", () => {
  beforeEach(seedLiveBook);

  it("applies exact matches and new clients, and holds probable/conflict back", async () => {
    const { summary } = await stageReconcileCommit();

    // Sarah and Ravi are the only two members with no live counterpart.
    expect(summary.clientsCreated).toBe(2);

    const sarah = await prisma.client.findFirstOrThrow({
      where: { sourceSystem: SOURCE, sourceRowId: "V1010" },
    });
    expect(sarah.name).toBe("Sarah");

    // The probable match (Emily) and the conflict (Lim Xin Yi / Linda Lim) are
    // never written: the live rows keep no vendor provenance and no new row is
    // invented for Linda.
    const emily = await prisma.client.findFirstOrThrow({
      where: { name: "Emily Watson" },
    });
    expect(emily.sourceRowId).toBeNull();
    const linda = await prisma.client.findFirst({ where: { name: "Linda Lim" } });
    expect(linda).toBeNull();
  });

  it("folds duplicate booking cards onto a single session", async () => {
    await stageReconcileCommit();

    const nurul = await prisma.client.findFirstOrThrow({
      where: { name: "Nurul Ain binti Rahman" },
    });
    // B2001 and B2002 are the same real session under two duplicate cards; only
    // one survives, plus the distinct B2011.
    const sessions = await prisma.trainingSession.count({
      where: { clientId: nurul.id },
    });
    expect(sessions).toBe(2);

    const pkg = await prisma.clientPackage.findFirstOrThrow({
      where: { clientId: nurul.id },
    });
    // 10 granted, two attended sessions deducted (not three): the vendor's
    // double-charge is corrected.
    expect(await getBalance(pkg.id)).toBe(8);
  });

  it("stamps every written row with its vendor provenance", async () => {
    await stageReconcileCommit();

    const packages = await prisma.clientPackage.findMany();
    expect(packages.length).toBeGreaterThan(0);
    for (const p of packages) {
      expect(p.sourceSystem).toBe(SOURCE);
      expect(p.sourceRowId).not.toBeNull();
    }

    const sessions = await prisma.trainingSession.findMany();
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) {
      expect(s.sourceSystem).toBe(SOURCE);
      expect(s.sourceRowId).not.toBeNull();
    }
  });

  it("is idempotent: importing the same export twice changes nothing", async () => {
    await stageReconcileCommit();

    const before = {
      clients: await prisma.client.count(),
      packages: await prisma.clientPackage.count(),
      sessions: await prisma.trainingSession.count(),
      ledger: await prisma.creditLedgerEntry.count(),
    };

    // A second, independent run over the identical files (a fresh batch).
    const batchId = await stageFixtures();
    const report = await reconcileClients(batchId);
    const actorUserId = await prisma.user
      .findFirstOrThrow({ where: { role: Role.MANAGER } })
      .then((u) => u.id);
    const summary = await commitImport({
      batchId,
      sourceSystem: SOURCE,
      report,
      actorUserId,
    });

    expect(summary.clientsCreated).toBe(0);
    expect(summary.packagesCreated).toBe(0);
    expect(summary.sessionsCreated).toBe(0);

    expect(await prisma.client.count()).toBe(before.clients);
    expect(await prisma.clientPackage.count()).toBe(before.packages);
    expect(await prisma.trainingSession.count()).toBe(before.sessions);
    expect(await prisma.creditLedgerEntry.count()).toBe(before.ledger);
  });
});

describe("parallel check", () => {
  beforeEach(seedLiveBook);

  it("surfaces the seeded balance discrepancies with both numbers", async () => {
    await stageReconcileCommit();

    const discrepancies = await computeDiscrepancies({
      packagesCsv: read("packages.csv"),
      sourceSystem: SOURCE,
    });
    const byMember = new Map(discrepancies.map((d) => [d.memberId, d]));

    // Nurul: we deduct one attended session the vendor double-charged.
    const nurul = byMember.get("V1001");
    expect(nurul).toBeDefined();
    expect(nurul!.ourBalance).toBe(8);
    expect(nurul!.theirBalance).toBe(9);
    expect(nurul!.entries.length).toBeGreaterThan(0);

    // Tan: a no-show the vendor never charged pulls our balance below theirs.
    const tan = byMember.get("V1004");
    expect(tan).toBeDefined();
    expect(tan!.ourBalance).toBe(8);
    expect(tan!.theirBalance).toBe(6);

    // Packages whose computed balance agrees with the vendor are not flagged.
    expect(byMember.has("V1005")).toBe(false);
    expect(byMember.has("V1011")).toBe(false);
  });
});
