import type { DailyPriceFile } from "@golden-price/core";

export type { DailyPriceFile };

const HOURS = 24;
const SLOTS_PER_HOUR = 12;

export interface ChannelManifest {
  id: string;
  dates: string[];
  latestDate: string | null;
}

export interface DataManifest {
  channels: ChannelManifest[];
}

export interface PriceObservation {
  label: string;
  time: number;
  value: number;
}

export interface DailyChange {
  absolute: number;
  percentage: number | null;
}

export type PriceDataState = "empty" | "sparse" | "ready" | "stale";

export function slotLabel(hour: number, slot: number): string {
  const minute = slot * 5;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function flattenDailyPrices(
  file: DailyPriceFile,
): { time: string; value: number | null }[] {
  if (
    file.prices.length !== HOURS ||
    file.prices.some((row) => row.length !== SLOTS_PER_HOUR)
  ) {
    throw new Error(
      `Expected ${HOURS} rows of ${SLOTS_PER_HOUR} price slots`,
    );
  }

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

export function validPriceObservations(
  file: DailyPriceFile,
): PriceObservation[] {
  return flattenDailyPrices(file).flatMap((point) => {
    if (typeof point.value !== "number" || !Number.isFinite(point.value)) {
      return [];
    }
    const time = Date.parse(`${file.date}T${point.time}:00+08:00`) / 1000;
    return [{ label: point.time, time, value: point.value }];
  });
}

export function calculateDailyChange(
  observations: PriceObservation[],
): DailyChange | null {
  const first = observations[0];
  const latest = observations.at(-1);
  if (!first || !latest || observations.length < 2) return null;

  const absolute = latest.value - first.value;
  return {
    absolute,
    percentage: first.value === 0 ? null : (absolute / first.value) * 100,
  };
}

export function shanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function classifyPriceData(
  file: DailyPriceFile,
  today = shanghaiDate(),
): PriceDataState {
  const observations = validPriceObservations(file);
  if (observations.length === 0) return "empty";
  if (file.date !== today) return "stale";
  if (observations.length === 1) return "sparse";
  return "ready";
}

export function latestPrice(
  file: DailyPriceFile,
): { time: string; value: number } | null {
  const latest = validPriceObservations(file).at(-1);
  return latest ? { time: latest.label, value: latest.value } : null;
}

export function dataUrl(dataBase: string, channelId: string, date: string): string {
  const normalizedBase = dataBase.endsWith("/") ? dataBase : `${dataBase}/`;
  return `${normalizedBase}data/${encodeURIComponent(channelId)}/${date}.json`;
}

export function manifestUrl(dataBase: string): string {
  const normalizedBase = dataBase.endsWith("/") ? dataBase : `${dataBase}/`;
  return `${normalizedBase}data/manifest.json`;
}

/** Prefer remote worker URL; fall back to the site base for local static data. */
export function resolveDataBase(
  siteBase: string,
  publicDataBaseUrl?: string | undefined,
): string {
  const remote = publicDataBaseUrl?.trim();
  if (remote) return remote.endsWith("/") ? remote : `${remote}/`;
  return siteBase.endsWith("/") ? siteBase : `${siteBase}/`;
}
