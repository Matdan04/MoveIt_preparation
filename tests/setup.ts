import { afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";

// Uses the shared client (pg driver adapter) from lib/db. vitest.config.ts has
// already pointed DATABASE_URL at the test database by the time this imports.

// Truncate every domain table before each test so cases never see each other's
// rows. Tables are discovered from the catalogue rather than hard-coded, so
// this keeps working as the schema grows in later steps. _prisma_migrations is
// left alone. Before Step 1 there are no domain tables and this is a no-op.
beforeEach(async () => {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
