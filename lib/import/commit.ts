// Phase 3: apply an approved reconciliation to live tables. Three properties
// matter and are all tested:
//
//   - Only APPROVED outcomes are written. Exact matches and new clients are the
//     unambiguous set the CLI applies; probable matches and conflicts are held
//     for a human (the manager UI) and are never touched here. This is the
//     "nothing above ambiguity is auto-merged" rule, enforced at the write.
//   - Every written row carries sourceSystem + sourceRowId, so any live record
//     traces back to the exact vendor row it came from.
//   - The whole thing is idempotent. Re-running the same export changes nothing:
//     clients, packages and sessions are guarded by their provenance (or, for
//     duplicate booking cards, by their natural key), and credit settlement is
//     itself idempotent.
//
// Not audited per row on purpose: a bulk import is one operational event, and
// the ImportBatch plus per-row sourceRowId provenance already record it. Adding
// an AuditLog row per imported entity would bury the hand-made changes the audit
// log exists to surface.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { grantOpeningCredits, settleSession } from "@/lib/services/credits";
import { matchCoach } from "./reconcile-refs";
import type { ClientReconciliationReport } from "./reconcile";

type Tx = Prisma.TransactionClient;

export type CommitSummary = {
  clientsCreated: number;
  packagesCreated: number;
  sessionsCreated: number;
  sessionsFolded: number; // duplicate vendor cards collapsed onto one session
  skippedBookings: number; // member/coach unresolved
  skippedPackages: number; // member unresolved or no catalogue match
};

export async function commitImport(params: {
  batchId: string;
  sourceSystem: string;
  report: ClientReconciliationReport;
  actorUserId: string;
}): Promise<CommitSummary> {
  const { batchId, sourceSystem, report, actorUserId } = params;

  return prisma.$transaction(async (tx) => {
    const summary: CommitSummary = {
      clientsCreated: 0,
      packagesCreated: 0,
      sessionsCreated: 0,
      sessionsFolded: 0,
      skippedBookings: 0,
      skippedPackages: 0,
    };

    // 1. Resolve every approved vendor Member ID to a live client id. Exact
    // matches point at an existing client; new clients are created (or reused
    // on a re-run). Probable/conflict/error members are deliberately absent
    // from this map, so their bookings and packages below simply do not apply.
    const memberToClient = new Map<string, string>();

    for (const m of report.exactMatches) {
      for (const id of m.sourceRowIds) memberToClient.set(id, m.liveClientId!);
    }

    for (const m of report.newClients) {
      const stamp = m.sourceRowIds[0];
      const existing = await tx.client.findFirst({
        where: { sourceSystem, sourceRowId: stamp },
      });
      const client =
        existing ??
        (await tx.client.create({
          data: {
            name: m.vendorName,
            phone: m.normalizedPhone ?? "",
            sourceSystem,
            sourceRowId: stamp,
          },
        }));
      if (!existing) summary.clientsCreated += 1;
      for (const id of m.sourceRowIds) memberToClient.set(id, client.id);
    }

    // 2. Packages. Key package identity on session count, not the vendor's
    // inconsistent names ("10 Session", "PT 10 Pack", "PT10" all mean the
    // 10-pack). One committed ClientPackage per member; its opening grant is a
    // ledger row, so the balance stays derived.
    const catalogue = await tx.package.findMany();
    const clientToPackage = new Map<string, string>();

    const stagedPackages = await tx.stagingPackage.findMany({ where: { batchId } });
    for (const p of stagedPackages) {
      const clientId = memberToClient.get(p.rawMemberId);
      if (!clientId || p.sessionsPurchased === null) {
        summary.skippedPackages += 1;
        continue;
      }
      const pkg = catalogue.find((c) => c.sessionCount === p.sessionsPurchased);
      if (!pkg) {
        summary.skippedPackages += 1;
        continue;
      }

      const existing = await tx.clientPackage.findFirst({
        where: { sourceSystem, sourceRowId: p.sourceRowId },
      });
      if (existing) {
        clientToPackage.set(clientId, existing.id);
        continue;
      }

      const purchasedAt = new Date();
      const clientPackage = await tx.clientPackage.create({
        data: {
          clientId,
          packageId: pkg.id,
          purchasedAt,
          expiresAt: new Date(
            purchasedAt.getTime() + pkg.validityDays * 86_400_000,
          ),
          creditsGranted: p.sessionsPurchased,
          sourceSystem,
          sourceRowId: p.sourceRowId,
        },
      });
      await grantOpeningCredits(
        {
          clientPackageId: clientPackage.id,
          credits: p.sessionsPurchased,
          actorUserId,
        },
        tx,
      );
      clientToPackage.set(clientId, clientPackage.id);
      summary.packagesCreated += 1;
    }

    // 3. Bookings → training sessions. Duplicate vendor cards for one real
    // session (same client after the merge, same coach, same instant) collapse
    // onto a single session — this is where the "logged twice" over-charge is
    // corrected. Attendance drives the credit deduction, so computed balances
    // now reflect real history rather than the vendor's counter.
    const coaches = await tx.coach.findMany({ include: { user: true } });

    // Seed the fold/idempotency set with sessions already imported in a prior
    // run, so a re-run creates nothing.
    const seenKeys = new Set(
      (
        await tx.trainingSession.findMany({
          where: { sourceSystem },
          select: { clientId: true, coachId: true, scheduledAt: true },
        })
      ).map((s) => sessionKey(s.clientId, s.coachId, s.scheduledAt)),
    );

    const stagedBookings = await tx.stagingBooking.findMany({ where: { batchId } });
    for (const b of stagedBookings) {
      const clientId = memberToClient.get(b.rawMemberId);
      const coach = matchCoach(b.rawCoach, coaches);
      if (!clientId || !coach || !b.scheduledAt) {
        summary.skippedBookings += 1;
        continue;
      }

      const key = sessionKey(clientId, coach.id, b.scheduledAt);
      if (seenKeys.has(key)) {
        summary.sessionsFolded += 1;
        continue;
      }
      seenKeys.add(key);

      const status = attendanceToStatus(b.rawAttended);
      const clientPackageId = clientToPackage.get(clientId) ?? null;

      const session = await tx.trainingSession.create({
        data: {
          clientId,
          coachId: coach.id,
          scheduledAt: b.scheduledAt,
          durationMin: b.durationMin ?? 60,
          status,
          clientPackageId,
          sourceSystem,
          sourceRowId: b.sourceRowId,
        },
      });
      summary.sessionsCreated += 1;

      // Settle credits for terminal outcomes only; an unmarked (SCHEDULED)
      // session moves nothing. Settlement is idempotent on its own, so this is
      // safe even if reached twice.
      if (status === "ATTENDED" || status === "NO_SHOW") {
        if (clientPackageId) {
          await settleSession(
            {
              clientPackageId,
              trainingSessionId: session.id,
              status,
              scheduledAt: b.scheduledAt,
              actorUserId,
            },
            tx,
          );
        }
      }
    }

    return summary;
  });
}

function sessionKey(clientId: string, coachId: string, scheduledAt: Date): string {
  return `${clientId}|${coachId}|${scheduledAt.getTime()}`;
}

function attendanceToStatus(
  raw: string,
): "ATTENDED" | "NO_SHOW" | "SCHEDULED" {
  const v = raw.trim().toUpperCase();
  if (v === "Y") return "ATTENDED";
  if (v === "N") return "NO_SHOW";
  return "SCHEDULED"; // blank register — the coach never marked it
}
