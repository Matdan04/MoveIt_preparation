import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Load .env, then force Prisma's DATABASE_URL onto the test database for the
// whole run. This is the single guard that keeps a test suite from truncating
// the dev database.
config();
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required to run the test suite.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

export default defineConfig({
  test: {
    // Suite runs against the real Postgres test database, not a mock.
    setupFiles: ["./tests/setup.ts"],
    // The truncation strategy in setup.ts is not safe to interleave, so keep
    // the whole suite on a single worker rather than parallel forks.
    fileParallelism: false,
    environment: "node",
  },
});
