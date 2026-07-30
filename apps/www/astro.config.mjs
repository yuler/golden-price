import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appRoot, "../..");

/** GitHub Actions injects "" for unset vars; treat blank like missing. */
function envOr(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

const base = envOr("BASE_PATH", "/");
const site = envOr("SITE", "https://gold.yuler.dev");

export default defineConfig({
  base,
  site,
  envDir: repoRoot,
  output: "static",
  integrations: [react()],
});
