import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appRoot, "../..");

const base = process.env.BASE_PATH ?? "/";
const site = process.env.SITE ?? "https://gold.yuler.dev";

export default defineConfig({
  base,
  site,
  envDir: repoRoot,
  output: "static",
  integrations: [react()],
});
