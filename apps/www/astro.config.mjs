import react from "@astrojs/react";
import { defineConfig } from "astro/config";

const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  site: "https://yuler.github.io",
  output: "static",
  integrations: [react()],
});
