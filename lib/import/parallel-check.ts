// The parallel check: the tool you actually run every day during a cutover. It
// reads the vendor's current stated balances and compares them, member by
// member, against the balance WE compute from the ledger for the package we
// imported from that same vendor row. Any gap is surfaced with both numbers and
// the ledger entries that explain ours — so a discrepancy is a conversation
// ("we charged a no-show they didn't"), never a mystery.
//
// It reads live tables but writes nothing.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getBalance } from "@/lib/services/credits";
import { parseCsv } from "./csv";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | typeof prisma;

export type LedgerLine = {
  delta: number;
  reason: string;
  createdAt: Date;
};

export type Discrepancy = {
  memberId: string;
  clientName: string;
  ourBalance: number;
  theirBalance: number;
  entries: LedgerLine[];
};

// Compare vendor-stated balances (from packages.csv) against our computed
// balances for the packages imported under `sourceSystem`. Returns only the
// members that disagree; a package we never imported (member unresolved during
// reconciliation) is skipped, not reported as a false gap.
export async function computeDiscrepancies(params: {
  packagesCsv: string;
  sourceSystem: string;
  db?: DbClient;
}): Promise<Discrepancy[]> {
  const { packagesCsv, sourceSystem } = params;
  const db = params.db ?? prisma;

  const discrepancies: Discrepancy[] = [];

  for (const row of parseCsv(packagesCsv)) {
    const memberId = (row["Member ID"] ?? "").trim();
    const statedRaw = (row["Balance Stated"] ?? "").trim();
    const theirBalance = Number.parseInt(statedRaw, 10);
    if (memberId === "" || Number.isNaN(theirBalance)) continue;

    const clientPackage = await db.clientPackage.findFirst({
      where: { sourceSystem, sourceRowId: memberId },
      include: { client: true },
    });
    if (!clientPackage) continue; // never imported this member — nothing to check

    const ourBalance = await getBalance(clientPackage.id, db);
    if (ourBalance === theirBalance) continue;

    const entries = await db.creditLedgerEntry.findMany({
      where: { clientPackageId: clientPackage.id },
      orderBy: { createdAt: "asc" },
      select: { delta: true, reason: true, createdAt: true },
    });

    discrepancies.push({
      memberId,
      clientName: clientPackage.client.name,
      ourBalance,
      theirBalance,
      entries,
    });
  }

  return discrepancies;
}
