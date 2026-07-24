import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach } from "vitest";

// A dedicated client for the test database. Tests import their own client for
// real work; this one exists solely to reset state between cases.
const prisma = new PrismaClient();

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
