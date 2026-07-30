import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import { loadRepoEnv, REPO_ROOT } from "@golden-price/node-env";

loadRepoEnv();

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
  envDir: REPO_ROOT,
  output: "static",
  integrations: [react()],
});
