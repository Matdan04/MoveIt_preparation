import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// This project sits under a home directory that also contains a stray
// package-lock.json, so Next.js otherwise infers the wrong workspace root and
// resolves the build output against it. Pin the root to this file's directory.
const nextConfig: NextConfig = {
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
