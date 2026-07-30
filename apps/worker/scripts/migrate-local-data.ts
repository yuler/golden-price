/**
 * Upload local repo data/ into the R2 bucket via Wrangler CLI.
 *
 * Requires: wrangler auth, bucket from wrangler.toml already created.
 *
 * Usage from apps/worker:
 *   pnpm migrate:r2
 */
import { spawnSync } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NodeFsDailyPriceStore,
  type DailyPriceStore,
} from "@golden-price/core";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");
const DATA_ROOT = path.join(REPO_ROOT, "data");
const BUCKET = "golden-price-data";

interface ChannelManifest {
  id: string;
  dates: string[];
  latestDate: string | null;
}

interface DataManifest {
  channels: ChannelManifest[];
}

async function buildManifest(store: DailyPriceStore): Promise<DataManifest> {
  const channels: ChannelManifest[] = [];
  for (const id of await store.listChannels()) {
    const dates = await store.listDates(id);
    if (dates.length === 0) continue;
    channels.push({
      id,
      dates,
      latestDate: dates.at(-1) ?? null,
    });
  }
  channels.sort((a, b) => a.id.localeCompare(b.id));
  return { channels };
}

function putObject(key: string, filePath: string): void {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "r2",
      "object",
      "put",
      `${BUCKET}/${key}`,
      "--file",
      filePath,
      "--content-type",
      "application/json; charset=utf-8",
      "--remote",
    ],
    { cwd: APP_ROOT, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to upload ${key}`);
  }
}

async function main(): Promise<void> {
  const store = new NodeFsDailyPriceStore(DATA_ROOT);
  const channels = await store.listChannels();
  if (channels.length === 0) {
    console.log(`No channel data under ${DATA_ROOT}`);
    return;
  }

  for (const channelId of channels) {
    const dates = await store.listDates(channelId);
    for (const date of dates) {
      const key = `${channelId}/${date}.json`;
      const filePath = path.join(DATA_ROOT, channelId, `${date}.json`);
      console.log(`Uploading ${key}`);
      putObject(key, filePath);
    }
  }

  const manifest = await buildManifest(store);
  const manifestPath = path.join(APP_ROOT, ".migrate-manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  try {
    console.log("Uploading manifest.json");
    putObject("manifest.json", manifestPath);
  } finally {
    await unlink(manifestPath).catch(() => undefined);
  }

  console.log(
    `Migrated ${channels.length} channel(s): ${channels.join(", ")}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
