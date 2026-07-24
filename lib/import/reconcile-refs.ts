// Phase 2, continued: the booking and package rows don't get matched to a live
// person themselves — they reference one, by the vendor's Member ID. So the job
// here is integrity, not identity: does the referenced member exist in this
// batch, does the coach string resolve to a real coach, and do bookings collide?
// Balance reconciliation (vendor-stated vs computed) is deliberately NOT here —
// that is the parallel-check in 9c.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { nameSimilarity } from "./normalize";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | typeof prisma;

const COACH_MATCH = 0.5;

export type RefIssue = { sourceRowId: string; reason: string };

export type BookingReconciliationReport = {
  resolvable: Array<{ sourceRowId: string; memberId: string; coach: string }>;
  unknownMember: RefIssue[]; // member id not staged in this batch (orphan)
  unknownCoach: RefIssue[]; // coach string matches no coach record
  overlaps: RefIssue[]; // coach double-booked
  parseErrors: RefIssue[];
};

export async function reconcileBookings(
  batchId: string,
  db: DbClient = prisma,
): Promise<BookingReconciliationReport> {
  const bookings = await db.stagingBooking.findMany({ where: { batchId } });
  const stagedMembers = new Set(
    (await db.stagingClient.findMany({ where: { batchId } })).map(
      (c) => c.sourceRowId,
    ),
  );
  const coaches = await db.coach.findMany({ include: { user: true } });

  const report: BookingReconciliationReport = {
    resolvable: [],
    unknownMember: [],
    unknownCoach: [],
    overlaps: [],
    parseErrors: [],
  };

  // Resolvable rows carry a resolved coach id so overlap detection can run.
  const resolved: Array<{
    sourceRowId: string;
    coachId: string;
    start: number;
    end: number;
  }> = [];

  for (const b of bookings) {
    if (b.parseErrors.length > 0) {
      report.parseErrors.push({
        sourceRowId: b.sourceRowId,
        reason: b.parseErrors.join("; "),
      });
    }

    if (!stagedMembers.has(b.rawMemberId)) {
      report.unknownMember.push({
        sourceRowId: b.sourceRowId,
        reason: `Member "${b.rawMemberId}" is not in this batch's clients — orphan booking.`,
      });
      continue;
    }

    const coach = bestCoach(b.rawCoach, coaches);
    if (!coach) {
      report.unknownCoach.push({
        sourceRowId: b.sourceRowId,
        reason: `Coach "${b.rawCoach.trim()}" matches no coach record.`,
      });
      continue;
    }

    report.resolvable.push({
      sourceRowId: b.sourceRowId,
      memberId: b.rawMemberId,
      coach: coach.user.name,
    });

    if (b.scheduledAt && b.durationMin) {
      const start = b.scheduledAt.getTime();
      resolved.push({
        sourceRowId: b.sourceRowId,
        coachId: coach.id,
        start,
        end: start + b.durationMin * 60_000,
      });
    }
  }

  // Same coach, overlapping intervals: report each colliding pair once.
  for (const [, group] of groupBy(resolved, (r) => r.coachId)) {
    group.sort((a, b) => a.start - b.start);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[j].start >= group[i].end) break; // sorted: no later overlap
        report.overlaps.push({
          sourceRowId: group[i].sourceRowId,
          reason: `Overlaps booking ${group[j].sourceRowId} for the same coach.`,
        });
      }
    }
  }

  return report;
}

export type PackageReconciliationReport = {
  resolvable: Array<{ sourceRowId: string; memberId: string; pkg: string }>;
  unknownMember: RefIssue[]; // member id not staged (orphan package)
  parseErrors: RefIssue[];
};

export async function reconcilePackages(
  batchId: string,
  db: DbClient = prisma,
): Promise<PackageReconciliationReport> {
  const packages = await db.stagingPackage.findMany({ where: { batchId } });
  const stagedMembers = new Set(
    (await db.stagingClient.findMany({ where: { batchId } })).map(
      (c) => c.sourceRowId,
    ),
  );

  const report: PackageReconciliationReport = {
    resolvable: [],
    unknownMember: [],
    parseErrors: [],
  };

  for (const p of packages) {
    if (p.parseErrors.length > 0) {
      report.parseErrors.push({
        sourceRowId: p.sourceRowId,
        reason: p.parseErrors.join("; "),
      });
    }
    if (!stagedMembers.has(p.rawMemberId)) {
      report.unknownMember.push({
        sourceRowId: p.sourceRowId,
        reason: `Member "${p.rawMemberId}" has a package but no client row — orphan package.`,
      });
      continue;
    }
    report.resolvable.push({
      sourceRowId: p.sourceRowId,
      memberId: p.rawMemberId,
      pkg: p.rawPackage.trim(),
    });
  }

  return report;
}

type CoachWithUser = { id: string; user: { name: string } };

function bestCoach(
  raw: string,
  coaches: CoachWithUser[],
): CoachWithUser | null {
  let best: CoachWithUser | null = null;
  let bestSim = 0;
  for (const c of coaches) {
    const sim = nameSimilarity(raw, c.user.name);
    if (sim > bestSim) {
      bestSim = sim;
      best = c;
    }
  }
  return best && bestSim >= COACH_MATCH ? best : null;
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    (map.get(k) ?? map.set(k, []).get(k)!).push(item);
  }
  return map;
}
