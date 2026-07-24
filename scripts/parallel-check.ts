import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../lib/db";
import { computeDiscrepancies } from "../lib/import/parallel-check";

// `pnpm parallel-check`: the daily cutover reconciliation. Reads the vendor's
// current stated balances and compares them to the balances we compute from the
// ledger for the packages we imported. It writes nothing — it exists to make
// divergence visible while old and new systems run side by side.

const SOURCE_SYSTEM = "legacy-booking-tool";

async function main() {
  const dir = process.argv[2] ?? "sample_vendor_export";
  const packagesCsv = readFileSync(join(dir, "packages.csv"), "utf8");

  const discrepancies = await computeDiscrepancies({
    packagesCsv,
    sourceSystem: SOURCE_SYSTEM,
  });

  if (discrepancies.length === 0) {
    console.log("Parallel check: no discrepancies. Computed balances match the vendor.");
    return;
  }

  console.log(`Parallel check: ${discrepancies.length} discrepancies.\n`);
  for (const d of discrepancies) {
    const gap = d.ourBalance - d.theirBalance;
    console.log(
      `${d.memberId}  ${d.clientName}` +
        `\n  ours ${d.ourBalance}  theirs ${d.theirBalance}  (${gap > 0 ? "+" : ""}${gap})`,
    );
    for (const e of d.entries) {
      console.log(
        `    ${e.createdAt.toISOString().slice(0, 10)}  ${e.delta > 0 ? "+" : ""}${e.delta}  ${e.reason}`,
      );
    }
    console.log("");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
