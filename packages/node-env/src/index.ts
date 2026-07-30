import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

/** Monorepo root (packages/node-env/src -> ../../..) */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const ENV_FILE = path.join(REPO_ROOT, ".env");

let loaded = false;

/**
 * Load repo-root `.env` into `process.env` once.
 * Existing env vars (CI, shell) keep precedence.
 */
export function loadRepoEnv(): void {
  if (loaded) return;
  loaded = true;
  if (existsSync(ENV_FILE)) loadEnvFile(ENV_FILE);
}
