import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../lib/db";
import {
  createBatch,
  stageClients,
  stageBookings,
  stagePackages,
} from "../lib/import/stage";
import { reconcileClients } from "../lib/import/reconcile";
import {
  reconcileBookings,
  reconcilePackages,
} from "../lib/import/reconcile-refs";
import { commitImport } from "../lib/import/commit";

// The importer is a CLI script, NOT a Server Action, on purpose. Parsing three
// files, staging them and reconciling against the whole live book is long,
// bursty work that has no place in a request cycle: it would hold an HTTP
// connection open, risk a serverless timeout, and give the manager no way to
// resume a half-finished run. Here it is a plain process the manager runs
// (`pnpm import`); the manager UI reviews and approves the report it produced.
//
// This entry point covers phases 1 (stage) and 2 (reconcile) only. It writes
// staging tables and reads live ones, but never mutates live data — commit is
// phase 3 (9c), gated behind an explicit flag.

const SOURCE_SYSTEM = "legacy-booking-tool";

async function main() {
  const args = process.argv.slice(2);
  // Committing is opt-in: --dry-run is the default, so a bare `pnpm run import`
  // only ever produces a report. Writing to live tables requires --commit.
  const doCommit = args.includes("--commit");
  const dir = args.find((a) => !a.startsWith("--")) ?? "sample_vendor_export";
  const read = (f: string) => readFileSync(join(dir, f), "utf8");

  console.log(
    `Import from ${dir} (source: ${SOURCE_SYSTEM})` +
      (doCommit ? " [COMMIT]" : " [dry run]") +
      "\n",
  );

  // --- Phase 1: stage ----------------------------------------------------
  const batchId = await createBatch(SOURCE_SYSTEM);
  const nClients = await stageClients(batchId, read("clients.csv"));
  const nBookings = await stageBookings(batchId, read("bookings.csv"));
  const nPackages = await stagePackages(batchId, read("packages.csv"));
  console.log(
    `Staged batch ${batchId}: ${nClients} clients, ${nBookings} bookings, ${nPackages} packages.\n`,
  );

  // --- Phase 2: reconcile ------------------------------------------------
  const clients = await reconcileClients(batchId);
  const bookings = await reconcileBookings(batchId);
  const packages = await reconcilePackages(batchId);

  console.log("CLIENTS");
  console.log(`  Exact matches (safe to apply): ${clients.exactMatches.length}`);
  for (const m of clients.exactMatches) {
    console.log(`    [${m.sourceRowIds.join(",")}] ${m.reason}`);
  }
  console.log(`  Probable (needs a decision): ${clients.probableMatches.length}`);
  for (const m of clients.probableMatches) {
    console.log(
      `    [${m.sourceRowIds.join(",")}] conf ${m.confidence.toFixed(2)} — ${m.reason}`,
    );
  }
  console.log(`  Conflicts (needs a decision): ${clients.conflicts.length}`);
  for (const c of clients.conflicts) {
    console.log(`    [${c.sourceRowIds.join(",")}] ${c.reason}`);
  }
  console.log(`  New clients (insert on commit): ${clients.newClients.length}`);
  for (const m of clients.newClients) {
    console.log(`    [${m.sourceRowIds.join(",")}] ${m.vendorName} — ${m.reason}`);
  }
  console.log(`  Errors (fix at source): ${clients.errors.length}`);
  for (const e of clients.errors) {
    console.log(`    [${e.sourceRowId}] ${e.vendorName}: ${e.errors.join("; ")}`);
  }

  console.log("\nBOOKINGS");
  console.log(`  Resolvable: ${bookings.resolvable.length}`);
  console.log(`  Orphan (unknown member): ${bookings.unknownMember.length}`);
  for (const i of bookings.unknownMember) console.log(`    [${i.sourceRowId}] ${i.reason}`);
  console.log(`  Unknown coach: ${bookings.unknownCoach.length}`);
  for (const i of bookings.unknownCoach) console.log(`    [${i.sourceRowId}] ${i.reason}`);
  console.log(`  Overlaps: ${bookings.overlaps.length}`);
  for (const i of bookings.overlaps) console.log(`    [${i.sourceRowId}] ${i.reason}`);
  console.log(`  Parse errors: ${bookings.parseErrors.length}`);
  for (const i of bookings.parseErrors) console.log(`    [${i.sourceRowId}] ${i.reason}`);

  console.log("\nPACKAGES");
  console.log(`  Resolvable: ${packages.resolvable.length}`);
  console.log(`  Orphan (unknown member): ${packages.unknownMember.length}`);
  for (const i of packages.unknownMember) console.log(`    [${i.sourceRowId}] ${i.reason}`);
  console.log(`  Parse errors: ${packages.parseErrors.length}`);
  for (const i of packages.parseErrors) console.log(`    [${i.sourceRowId}] ${i.reason}`);

  if (!doCommit) {
    console.log(
      "\nPhase 2 complete. Nothing above ambiguity was merged and no live data was written.",
    );
    console.log("Re-run with --commit to apply the exact matches and new clients.");
    return;
  }

  // --- Phase 3: commit ---------------------------------------------------
  // Applies only the unambiguous outcomes (exact matches, new clients).
  // Probable matches and conflicts stay pending a human decision.
  const manager = await prisma.user.findFirstOrThrow({
    where: { role: "MANAGER" },
  });
  const summary = await commitImport({
    batchId,
    sourceSystem: SOURCE_SYSTEM,
    report: clients,
    actorUserId: manager.id,
  });

  console.log("\nCOMMIT");
  console.log(`  Clients created: ${summary.clientsCreated}`);
  console.log(`  Packages created: ${summary.packagesCreated}`);
  console.log(`  Sessions created: ${summary.sessionsCreated}`);
  console.log(`  Duplicate sessions folded: ${summary.sessionsFolded}`);
  console.log(`  Bookings skipped (unresolved): ${summary.skippedBookings}`);
  console.log(`  Packages skipped (unresolved): ${summary.skippedPackages}`);
  console.log(
    "\nCommit complete. Re-running this export will change nothing (idempotent).",
  );
  console.log(
    `Probable matches (${clients.probableMatches.length}) and conflicts (${clients.conflicts.length}) were NOT applied — they await a human decision.`,
  );
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
