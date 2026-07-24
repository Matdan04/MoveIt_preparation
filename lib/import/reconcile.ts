// Phase 2: match staged rows against the live book and bucket the outcomes for a
// human to review. The governing rules (from CLAUDE.md):
//
//   - Phone normalised to E.164 is the PRIMARY match key. Name similarity is a
//     secondary signal only and never sufficient on its own.
//   - Nothing above ambiguity is auto-merged. Exact, phone-keyed and
//     name-corroborated matches are safe to apply on commit; everything else
//     (probable matches, conflicts) is a decision the manager makes.
//
// This module only reads — live tables are untouched until phase 3 (commit).

import type { Client, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone, nameSimilarity } from "./normalize";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | typeof prisma;

// Two names in one phone cluster are the SAME person above this. Set above the
// Linda-Lim / Lim-Xin-Yi shared-phone case (which scores 0.5) so that pair is
// correctly read as two people, not a duplicate.
const SAME_PERSON = 0.6;
// A name need only reach this to CORROBORATE a phone match (or to raise a
// phone-less row to "probable"). Below it, a lone name match is never enough.
const CORROBORATION = 0.5;

export type ClientMatch = {
  sourceRowIds: string[]; // vendor Member IDs folded into this person
  vendorName: string;
  normalizedPhone: string | null;
  liveClientId: string | null;
  liveClientName: string | null;
  confidence: number; // 0..1
  reason: string;
};

export type ClientConflict = {
  sourceRowIds: string[];
  normalizedPhone: string | null;
  vendorNames: string[];
  reason: string;
};

export type StagingRowError = {
  sourceRowId: string;
  vendorName: string;
  errors: string[];
};

export type ClientReconciliationReport = {
  exactMatches: ClientMatch[];
  probableMatches: ClientMatch[];
  conflicts: ClientConflict[];
  newClients: ClientMatch[]; // no live match; insert on commit
  errors: StagingRowError[]; // could not be reconciled (e.g. bad phone)
};

export async function reconcileClients(
  batchId: string,
  db: DbClient = prisma,
): Promise<ClientReconciliationReport> {
  const staged = await db.stagingClient.findMany({ where: { batchId } });
  const live = await db.client.findMany();

  // Live clients indexed by normalised phone (their stored phone is already
  // E.164, but normalise anyway so the two sides are compared identically).
  const liveByPhone = new Map<string, Client[]>();
  for (const c of live) {
    const p = normalizePhone(c.phone).phone;
    if (!p) continue;
    (liveByPhone.get(p) ?? liveByPhone.set(p, []).get(p)!).push(c);
  }

  const report: ClientReconciliationReport = {
    exactMatches: [],
    probableMatches: [],
    conflicts: [],
    newClients: [],
    errors: [],
  };

  // A row whose phone was present but unparseable has no primary key and is not
  // matched on name alone — it is an error the manager must fix at source.
  const phoneErrorRows = staged.filter(
    (r) => r.normalizedPhone === null && hasPhoneError(r),
  );
  for (const r of phoneErrorRows) {
    report.errors.push({
      sourceRowId: r.sourceRowId,
      vendorName: r.rawName.trim(),
      errors: r.parseErrors,
    });
  }

  // Rows with a usable phone: group by it, then decide per group.
  const withPhone = staged.filter((r) => r.normalizedPhone !== null);
  const groups = new Map<string, typeof staged>();
  for (const r of withPhone) {
    const key = r.normalizedPhone!;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  for (const [phone, rows] of groups) {
    if (!isOnePerson(rows)) {
      // Distinct people sharing one phone: the primary key points at two
      // humans, so it cannot decide anything. Escalate, merge nothing.
      report.conflicts.push({
        sourceRowIds: rows.map((r) => r.sourceRowId),
        normalizedPhone: phone,
        vendorNames: rows.map((r) => r.rawName.trim()),
        reason: `Phone ${phone} is shared by distinct names (${rows
          .map((r) => `"${r.rawName.trim()}"`)
          .join(", ")}); cannot key on phone. Human decision required.`,
      });
      continue;
    }

    // One person, possibly recorded across several duplicate cards.
    const representative = rows.reduce((a, b) =>
      b.rawName.trim().length > a.rawName.trim().length ? b : a,
    );
    const sourceRowIds = rows.map((r) => r.sourceRowId);
    const liveMatches = liveByPhone.get(phone) ?? [];

    if (liveMatches.length === 0) {
      report.newClients.push({
        sourceRowIds,
        vendorName: representative.rawName.trim(),
        normalizedPhone: phone,
        liveClientId: null,
        liveClientName: null,
        confidence: 1,
        reason: `Phone ${phone} is not in the live book — import as a new client.`,
      });
      continue;
    }

    const liveClient = liveMatches[0];
    const corroboration = Math.max(
      ...rows.map((r) => nameSimilarity(r.rawName, liveClient.name)),
    );

    if (corroboration >= CORROBORATION) {
      report.exactMatches.push({
        sourceRowIds,
        vendorName: representative.rawName.trim(),
        normalizedPhone: phone,
        liveClientId: liveClient.id,
        liveClientName: liveClient.name,
        confidence: 1,
        reason:
          `Phone ${phone} matches live client "${liveClient.name}"` +
          (rows.length > 1
            ? ` (${rows.length} duplicate vendor cards folded together)`
            : "") +
          `; name corroborates (${corroboration.toFixed(2)}).`,
      });
    } else {
      // Phone matches but the name does not back it up — plausible, not certain.
      report.probableMatches.push({
        sourceRowIds,
        vendorName: representative.rawName.trim(),
        normalizedPhone: phone,
        liveClientId: liveClient.id,
        liveClientName: liveClient.name,
        confidence: 0.6,
        reason: `Phone ${phone} matches live client "${liveClient.name}", but the name does not corroborate (${corroboration.toFixed(2)}). Human decision required.`,
      });
    }
  }

  // Phone-less rows (legitimately absent, no error): fall back to a name match,
  // which can only ever produce a "probable" — never an auto-merge.
  const noPhone = staged.filter(
    (r) => r.normalizedPhone === null && !hasPhoneError(r),
  );
  for (const r of noPhone) {
    let best: Client | null = null;
    let bestSim = 0;
    for (const c of live) {
      const sim = nameSimilarity(r.rawName, c.name);
      if (sim > bestSim) {
        bestSim = sim;
        best = c;
      }
    }

    if (best && bestSim >= CORROBORATION) {
      const emailMatch =
        r.email !== null && r.email === (best.email ?? "").toLowerCase();
      report.probableMatches.push({
        sourceRowIds: [r.sourceRowId],
        vendorName: r.rawName.trim(),
        normalizedPhone: null,
        liveClientId: best.id,
        liveClientName: best.name,
        confidence: Math.min(0.9, bestSim + (emailMatch ? 0.2 : 0)),
        reason: `No phone on record; name resembles live client "${best.name}" (${bestSim.toFixed(
          2,
        )})${emailMatch ? " and the email matches" : ""}. Human decision required.`,
      });
    } else {
      report.errors.push({
        sourceRowId: r.sourceRowId,
        vendorName: r.rawName.trim(),
        errors: ["No phone and no confident name match; cannot reconcile."],
      });
    }
  }

  return report;
}

function hasPhoneError(r: { parseErrors: string[] }): boolean {
  return r.parseErrors.some((e) => e.toLowerCase().includes("phone"));
}

// A phone group is one person when every pair of names corroborates. A single
// row is trivially one person.
function isOnePerson(rows: Array<{ rawName: string }>): boolean {
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (nameSimilarity(rows[i].rawName, rows[j].rawName) < SAME_PERSON) {
        return false;
      }
    }
  }
  return true;
}
