// The credit ledger. The single most important invariant in the project lives
// here: a package's live balance is NEVER a stored number — it is always the
// sum of CreditLedgerEntry.delta rows. That makes the balance a derived fact
// with a complete, ordered audit trail behind it, so "why is this client on 3
// credits?" is always answerable by reading rows, never by trusting a counter
// that some past write may have got wrong.
//
// The ledger is append-only. There is no exported update or delete path — a
// correction is a new compensating entry, so history is never rewritten. Every
// balance-affecting write runs inside a transaction.
//
// Authorization is the caller's responsibility: a Server Action asserts the
// actor may adjust credits (assertCanAdjustCredits) before delegating here.
// This module is the mechanism, not the policy.

import type { CreditLedgerEntry, Prisma, TrainingSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";

// A no-show or a late client cancellation charges the client if it happens
// within this window of the scheduled start; earlier cancellations are free.
export const NO_SHOW_WINDOW_MS = 12 * 60 * 60 * 1000;

// Reason strings are structured, not free prose, so the ledger stays greppable
// and settlement entries are identifiable for the idempotency guard below.
const SETTLEMENT_PREFIX = "session:";
const GRANT_REASON = "package:GRANT";

type Tx = Prisma.TransactionClient;

// Either the shared client or an open transaction — reads compose into a larger
// transaction (e.g. the session-lifecycle work in the next step) without a
// second connection.
type DbClient = Tx | typeof prisma;

// The live balance: the sum of every ledger delta for the package. Expiry does
// NOT enter here — an expired package still owns whatever its ledger says; that
// credits can no longer be *spent* is a booking-eligibility concern, decided
// where sessions are booked, not a property of the balance.
export async function getBalance(
  clientPackageId: string,
  db: DbClient = prisma,
): Promise<number> {
  const { _sum } = await db.creditLedgerEntry.aggregate({
    where: { clientPackageId },
    _sum: { delta: true },
  });
  return _sum.delta ?? 0;
}

// The pure credit rule from CLAUDE.md, kept side-effect-free so it can be read
// and unit-tested in isolation. `decidedAt` is when the outcome is recorded
// (now, in production); it is the point compared against the scheduled start.
export function creditDeltaForOutcome(
  status: TrainingSessionStatus,
  scheduledAt: Date,
  decidedAt: Date,
): number {
  // "Late" = decided at or after 12h before the scheduled start. A no-show is
  // always late (it happens at/after the start); a client cancellation is late
  // only if the notice was short.
  const late =
    decidedAt.getTime() >= scheduledAt.getTime() - NO_SHOW_WINDOW_MS;

  switch (status) {
    case "ATTENDED":
      return -1;
    case "NO_SHOW":
      return late ? -1 : 0;
    case "CANCELLED_BY_CLIENT":
      return late ? -1 : 0;
    case "CANCELLED_BY_STUDIO":
      return 0;
    case "SCHEDULED":
      // Booking moves no credits; a credit is only spent on an outcome.
      return 0;
    default:
      return 0;
  }
}

// Record the opening grant as a ledger row at purchase time. The grant is the
// only reason a fresh package has any balance at all — there is no separate
// "credits" column feeding it.
export async function grantOpeningCredits(
  params: { clientPackageId: string; credits: number; actorUserId: string },
  tx?: Tx,
): Promise<CreditLedgerEntry> {
  const run = (t: Tx) =>
    t.creditLedgerEntry.create({
      data: {
        clientPackageId: params.clientPackageId,
        delta: params.credits,
        reason: GRANT_REASON,
        createdByUserId: params.actorUserId,
      },
    });
  return tx ? run(tx) : prisma.$transaction(run);
}

// Settle a session's credit effect exactly once. Returns the new entry, or null
// if the session was already settled (idempotent — marking attended twice must
// not double-deduct). A terminal outcome always writes a row, even a 0-delta
// one for a studio cancellation, so the session is recorded as settled and can
// never be re-settled into a charge later.
export async function settleSession(
  params: {
    clientPackageId: string;
    trainingSessionId: string;
    status: TrainingSessionStatus;
    scheduledAt: Date;
    actorUserId: string;
    decidedAt?: Date;
  },
  tx?: Tx,
): Promise<CreditLedgerEntry | null> {
  return tx
    ? settleWithinTx(tx, params)
    : prisma.$transaction((t) => settleWithinTx(t, params));
}

async function settleWithinTx(
  tx: Tx,
  params: {
    clientPackageId: string;
    trainingSessionId: string;
    status: TrainingSessionStatus;
    scheduledAt: Date;
    actorUserId: string;
    decidedAt?: Date;
  },
): Promise<CreditLedgerEntry | null> {
  // Serialise concurrent settlements of the same session by taking a row lock
  // on it first: a competing transaction blocks here until we commit, then sees
  // our settlement entry below and no-ops. Without this lock, two concurrent
  // marks under READ COMMITTED would each read "not yet settled" and both
  // insert — a double deduction. A partial unique index on
  // (trainingSessionId) WHERE reason LIKE 'session:%', or SERIALIZABLE
  // isolation, would close the same gap; the row lock keeps it self-contained
  // in this service.
  await tx.$queryRaw`SELECT id FROM "TrainingSession" WHERE id = ${params.trainingSessionId} FOR UPDATE`;

  const existing = await tx.creditLedgerEntry.findFirst({
    where: {
      trainingSessionId: params.trainingSessionId,
      reason: { startsWith: SETTLEMENT_PREFIX },
    },
  });
  if (existing) return null;

  const delta = creditDeltaForOutcome(
    params.status,
    params.scheduledAt,
    params.decidedAt ?? new Date(),
  );

  return tx.creditLedgerEntry.create({
    data: {
      clientPackageId: params.clientPackageId,
      trainingSessionId: params.trainingSessionId,
      delta,
      reason: `${SETTLEMENT_PREFIX}${params.status}`,
      createdByUserId: params.actorUserId,
    },
  });
}

// A manager's manual adjustment: any delta, but a non-empty reason is mandatory
// — a silent balance change is exactly what the ledger exists to prevent.
export async function adjustCredits(
  params: {
    clientPackageId: string;
    delta: number;
    reason: string;
    actorUserId: string;
  },
  tx?: Tx,
): Promise<CreditLedgerEntry> {
  const reason = params.reason.trim();
  if (reason.length === 0) {
    throw new Error("A manual credit adjustment requires a non-empty reason.");
  }
  const run = async (t: Tx) => {
    const entry = await t.creditLedgerEntry.create({
      data: {
        clientPackageId: params.clientPackageId,
        delta: params.delta,
        reason,
        createdByUserId: params.actorUserId,
      },
    });
    // A discretionary override is logged on top of its ledger row: the audit log
    // is where a manager looks for "who moved credit by hand, and why".
    await recordAudit(t, {
      actorUserId: params.actorUserId,
      entityType: "CreditLedgerEntry",
      entityId: entry.id,
      action: "ADJUST_CREDITS",
      after: entry,
    });
    return entry;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

// Reverse an existing entry by posting its inverse — the correction path. The
// original row is never touched; the pair (entry + reversal) sums to zero and
// both remain visible in the history.
export async function reverseEntry(
  params: { entryId: string; reason: string; actorUserId: string },
  tx?: Tx,
): Promise<CreditLedgerEntry> {
  const reason = params.reason.trim();
  if (reason.length === 0) {
    throw new Error("A reversal requires a non-empty reason.");
  }
  const run = async (t: Tx) => {
    const original = await t.creditLedgerEntry.findUnique({
      where: { id: params.entryId },
    });
    if (!original) {
      throw new Error("Cannot reverse a ledger entry that does not exist.");
    }
    const entry = await t.creditLedgerEntry.create({
      data: {
        clientPackageId: original.clientPackageId,
        trainingSessionId: original.trainingSessionId,
        delta: -original.delta,
        reason,
        createdByUserId: params.actorUserId,
      },
    });
    // The diff points back at the row being undone, so the log reads as
    // "reversed entry X" rather than a bare compensating delta.
    await recordAudit(t, {
      actorUserId: params.actorUserId,
      entityType: "CreditLedgerEntry",
      entityId: entry.id,
      action: "REVERSE_CREDITS",
      before: original,
      after: entry,
    });
    return entry;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}
