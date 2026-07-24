// The audit log's single choke point. Every actor-initiated mutation records one
// row through recordAudit, and it does so inside the mutation's OWN transaction
// (the caller passes its tx client), so the audit row and the change it records
// commit or roll back together — there is never an audited change without its
// trail, nor a trail for a change that was rolled back.
//
// Why a service-layer helper and not a Prisma client extension: an extension
// would catch every write automatically, but it does not know the acting user
// (it would need request-scoped async context) and cannot cheaply capture the
// "before" snapshot an update needs. An explicit call at each mutation keeps the
// actor and the before/after in the one place that already has them, and stays
// greppable for a reader with 35 minutes. What we give up is the automatic
// guarantee: a new mutation that forgets to call recordAudit is silently
// un-audited. The authorization suite plus code review are the backstop there.
//
// Two credit paths are deliberately NOT logged here — grantOpeningCredits and
// settleSession. Those write CreditLedgerEntry rows, which ARE an append-only
// audit trail of their own; duplicating them in AuditLog would double-count the
// same fact. A manager's discretionary override (adjustCredits, reverseEntry)
// DOES get an AuditLog row on top of its ledger row, because the override is
// exactly what someone reviewing the audit log needs to see.

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// A snapshot is a plain Prisma row. Clone it via JSON (which also turns Dates
// into ISO strings for the Json column) and drop any secret before it is stored.
// Nothing auditable here is a User row, but redaction is unconditional so a
// future caller cannot leak a passwordHash into a manager-readable log.
function redact(snapshot: unknown): Prisma.InputJsonValue | undefined {
  if (snapshot == null) return undefined;
  const json = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  if (json && typeof json === "object" && "passwordHash" in json) {
    delete json.passwordHash;
  }
  return json as Prisma.InputJsonValue;
}

export type AuditEntry = {
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  // Prior and resulting state. Omit `before` for a create, `after` for a delete.
  before?: unknown;
  after?: unknown;
};

export async function recordAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      before: redact(entry.before),
      after: redact(entry.after),
    },
  });
}
