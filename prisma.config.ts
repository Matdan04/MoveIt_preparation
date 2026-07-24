import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 removed `url` from the schema datasource. The connection string for
// CLI commands (migrate, db, studio) lives here instead. Runtime connections
// are made separately in lib/db.ts via the pg driver adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
