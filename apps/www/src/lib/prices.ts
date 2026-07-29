import type { DailyPriceFile } from "@golden-price/collector-core";

export type { DailyPriceFile };

const HOURS = 24;
const SLOTS_PER_HOUR = 6;

export interface ChannelManifest {
  id: string;
  dates: string[];
  latestDate: string | null;
}

export interface DataManifest {
  channels: ChannelManifest[];
}

export function slotLabel(hour: number, slot: number): string {
  const minute = slot * 10;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function flattenDailyPrices(
  file: DailyPriceFile,
): { time: string; value: number | null }[] {
  const points: { time: string; value: number | null }[] = [];
  for (let hour = 0; hour < HOURS; hour++) {
    for (let slot = 0; slot < SLOTS_PER_HOUR; slot++) {
      points.push({
        time: slotLabel(hour, slot),
        value: file.prices[hour]?.[slot] ?? null,
      });
    }
  }
  return points;
}

export function latestPrice(
  file: DailyPriceFile,
): { time: string; value: number } | null {
  const points = flattenDailyPrices(file);
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (typeof point.value === "number" && Number.isFinite(point.value)) {
      return { time: point.time, value: point.value };
    }
  }
  return null;
}

export function dataUrl(base: string, channelId: string, date: string): string {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}data/${encodeURIComponent(channelId)}/${date}.json`;
}

export function manifestUrl(base: string): string {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}data/manifest.json`;
}
