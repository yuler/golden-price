import react from "@astrojs/react";
import AstroPWA from "@vite-pwa/astro";
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
  integrations: [
    react(),
    AstroPWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
      ],
      manifest: {
        name: "今日金价",
        short_name: "金价",
        description: "每五分钟采集一次的人民币黄金克价与当日走势。",
        theme_color: "#101116",
        background_color: "#101116",
        display: "standalone",
        lang: "zh-CN",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        navigateFallback: base === "/" ? "/" : `${base}/`,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
      },
      experimental: {
        directoryAndTrailingSlashHandler: true,
      },
    }),
  ],
});
