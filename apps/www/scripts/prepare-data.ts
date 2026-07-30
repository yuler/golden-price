import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoEnv, REPO_ROOT } from "@golden-price/node-env";

loadRepoEnv();

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = path.join(REPO_ROOT, "data");
const OUTPUT_ROOT = path.join(APP_ROOT, "public", "data");

interface ChannelManifest {
  id: string;
  dates: string[];
  latestDate: string | null;
}

interface DataManifest {
  channels: ChannelManifest[];
}

async function listJsonDates(channelDir: string): Promise<string[]> {
  const entries = await readdir(channelDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/, ""))
    .sort();
}

async function main(): Promise<void> {
  const remoteDataBase = process.env.PUBLIC_DATA_BASE_URL?.trim();
  if (remoteDataBase) {
    console.log(
      "PUBLIC_DATA_BASE_URL is set; skipping local data copy for static build.",
    );
    return;
  }

  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });

  const channels: ChannelManifest[] = [];

  let channelEntries: string[];
  try {
    channelEntries = await readdir(DATA_ROOT);
  } catch {
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      throw new Error(
        "No local data/ and PUBLIC_DATA_BASE_URL is unset. Set PUBLIC_DATA_BASE_URL to the Worker origin for CI/production builds.",
      );
    }
    await writeFile(
      path.join(OUTPUT_ROOT, "manifest.json"),
      `${JSON.stringify({ channels: [] } satisfies DataManifest, null, 2)}\n`,
      "utf8",
    );
    console.log("No data directory found; wrote empty manifest.");
    return;
  }

  for (const channelId of channelEntries) {
    const channelPath = path.join(DATA_ROOT, channelId);
    const entries = await readdir(channelPath).catch(() => null);
    if (!entries) continue;

    const dates = await listJsonDates(channelPath);
    if (dates.length === 0) continue;

    const destDir = path.join(OUTPUT_ROOT, channelId);
    await mkdir(destDir, { recursive: true });

    for (const date of dates) {
      await cp(
        path.join(channelPath, `${date}.json`),
        path.join(destDir, `${date}.json`),
      );
    }

    channels.push({
      id: channelId,
      dates,
      latestDate: dates.at(-1) ?? null,
    });
  }

  channels.sort((a, b) => a.id.localeCompare(b.id));

  const manifest: DataManifest = { channels };
  await writeFile(
    path.join(OUTPUT_ROOT, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const summary = channels
    .map((c) => `${c.id} (${c.dates.length} days)`)
    .join(", ");
  console.log(`Prepared data manifest: ${summary || "no channels"}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
