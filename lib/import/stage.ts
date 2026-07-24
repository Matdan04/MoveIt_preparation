// Phase 1 of the import: parse the raw CSVs into staging tables. Live tables are
// never touched here. Every row is staged even when it has problems — a parse
// failure is recorded in the row's `parseErrors` array, never thrown, so one bad
// line cannot abort a whole vendor file.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseCsv } from "./csv";
import {
  normalizePhone,
  normalizeName,
  normalizeEmail,
  parseVendorDate,
} from "./normalize";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | typeof prisma;

export async function createBatch(
  sourceSystem: string,
  db: DbClient = prisma,
): Promise<string> {
  const batch = await db.importBatch.create({ data: { sourceSystem } });
  return batch.id;
}

export async function stageClients(
  batchId: string,
  csvText: string,
  db: DbClient = prisma,
): Promise<number> {
  const records = parseCsv(csvText);
  for (const r of records) {
    const errors: string[] = [];

    const phone = normalizePhone(r["Mobile"] ?? "");
    if (phone.error) errors.push(phone.error);

    const joined = parseVendorDate(r["Joined"] ?? "");
    if (joined.error) errors.push(joined.error);

    await db.stagingClient.create({
      data: {
        batchId,
        sourceRowId: (r["Member ID"] ?? "").trim(),
        rawName: r["Name"] ?? "",
        rawPhone: r["Mobile"] ?? "",
        rawEmail: r["Email"] ?? "",
        rawJoined: r["Joined"] ?? "",
        rawStatus: r["Status"] ?? "",
        normalizedPhone: phone.phone,
        normalizedName: normalizeName(r["Name"] ?? ""),
        email: normalizeEmail(r["Email"] ?? ""),
        joinedAt: joined.date,
        parseErrors: errors,
      },
    });
  }
  return records.length;
}

export async function stageBookings(
  batchId: string,
  csvText: string,
  db: DbClient = prisma,
): Promise<number> {
  const records = parseCsv(csvText);
  for (const r of records) {
    const errors: string[] = [];

    // Vendor "When" is Asia/Kuala_Lumpur wall-clock; store the matching UTC
    // instant (KL is UTC+8 year-round) so it renders back correctly.
    const scheduledAt = parseVendorWhen(r["When"] ?? "");
    if (!scheduledAt) errors.push(`Unrecognised datetime "${r["When"] ?? ""}"`);

    const durationMin = Number.parseInt((r["Duration"] ?? "").trim(), 10);
    if (Number.isNaN(durationMin)) {
      errors.push(`Unparseable duration "${r["Duration"] ?? ""}"`);
    }

    await db.stagingBooking.create({
      data: {
        batchId,
        sourceRowId: (r["Booking ID"] ?? "").trim(),
        rawMemberId: (r["Member ID"] ?? "").trim(),
        rawCoach: r["Coach"] ?? "",
        rawWhen: r["When"] ?? "",
        rawDuration: r["Duration"] ?? "",
        rawAttended: r["Attended"] ?? "",
        scheduledAt,
        durationMin: Number.isNaN(durationMin) ? null : durationMin,
        parseErrors: errors,
      },
    });
  }
  return records.length;
}

export async function stagePackages(
  batchId: string,
  csvText: string,
  db: DbClient = prisma,
): Promise<number> {
  const records = parseCsv(csvText);
  for (const r of records) {
    const errors: string[] = [];

    const sessions = Number.parseInt((r["Sessions Purchased"] ?? "").trim(), 10);
    if (Number.isNaN(sessions)) {
      errors.push(`Unparseable sessions "${r["Sessions Purchased"] ?? ""}"`);
    }
    const balance = Number.parseInt((r["Balance Stated"] ?? "").trim(), 10);
    if (Number.isNaN(balance)) {
      errors.push(`Unparseable balance "${r["Balance Stated"] ?? ""}"`);
    }

    await db.stagingPackage.create({
      data: {
        batchId,
        sourceRowId: (r["Member ID"] ?? "").trim(),
        rawMemberId: (r["Member ID"] ?? "").trim(),
        rawPackage: r["Package"] ?? "",
        rawSessions: r["Sessions Purchased"] ?? "",
        rawBalance: r["Balance Stated"] ?? "",
        sessionsPurchased: Number.isNaN(sessions) ? null : sessions,
        balanceStated: Number.isNaN(balance) ? null : balance,
        parseErrors: errors,
      },
    });
  }
  return records.length;
}

// Vendor datetime looks like "2024-03-15 09:00" in KL local time.
function parseVendorWhen(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, min] = m;
  // KL is UTC+8; subtract 8h from the wall-clock hour to get the UTC instant.
  return new Date(Date.UTC(+y, +mo - 1, +d, +h - 8, +min));
}
