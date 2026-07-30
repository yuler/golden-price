import type { DailyPriceStore } from "@golden-price/core/worker";
import { MANIFEST_KEY, type R2DailyPriceStore } from "./r2-store.js";

export interface ChannelManifest {
  id: string;
  dates: string[];
  latestDate: string | null;
}

export interface DataManifest {
  channels: ChannelManifest[];
}

export async function buildManifest(
  store: DailyPriceStore,
): Promise<DataManifest> {
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

export async function writeManifest(store: R2DailyPriceStore): Promise<DataManifest> {
  const manifest = await buildManifest(store);
  await store.putRaw(
    MANIFEST_KEY,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}
