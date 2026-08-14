import {
  HOURS,
  JINGJINJIN_STORAGE_KEY,
  SLOTS_PER_HOUR,
  type DailyPriceFile,
} from "@golden-price/core/worker";

export interface OgObservation {
  label: string;
  value: number;
}

export interface OgQuote {
  price: number;
  absoluteChange: number | null;
  percentageChange: number | null;
  updatedLabel: string;
  date: string;
  source: string;
  observations: OgObservation[];
}

export function sourceDisplayName(channelId: string): string {
  return channelId === JINGJINJIN_STORAGE_KEY ? "京金金" : channelId;
}

export function formatSigned(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
}

export function changeTone(value: number): "up" | "down" | "flat" {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function slotLabel(hour: number, slot: number): string {
  const minute = slot * 5;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function observationsFromFile(file: DailyPriceFile): OgObservation[] {
  if (
    file.prices.length !== HOURS ||
    file.prices.some((row) => row.length !== SLOTS_PER_HOUR)
  ) {
    throw new Error(`Expected ${HOURS} rows of ${SLOTS_PER_HOUR} price slots`);
  }

  const observations: OgObservation[] = [];
  for (let hour = 0; hour < HOURS; hour++) {
    for (let slot = 0; slot < SLOTS_PER_HOUR; slot++) {
      const value = file.prices[hour]?.[slot];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      observations.push({ label: slotLabel(hour, slot), value });
    }
  }
  return observations;
}

export function quoteFromDailyFile(
  file: DailyPriceFile,
  channelId: string,
): OgQuote | null {
  const observations = observationsFromFile(file);
  const latest = observations.at(-1);
  if (!latest) return null;

  let absoluteChange: number | null = null;
  let percentageChange: number | null = null;
  const first = observations[0];
  if (first && observations.length >= 2) {
    absoluteChange = latest.value - first.value;
    percentageChange =
      first.value === 0 ? null : (absoluteChange / first.value) * 100;
  }

  return {
    price: latest.value,
    absoluteChange,
    percentageChange,
    updatedLabel: `${file.date} ${latest.label} 更新`,
    date: file.date,
    source: `数据源：${sourceDisplayName(channelId)}`,
    observations,
  };
}

/** True when the stored OG does not match today's latest price. */
export function isOgStale(
  metadata: Record<string, string> | undefined,
  quote: OgQuote,
): boolean {
  if (!metadata?.date || !metadata.price) return true;
  return (
    metadata.date !== quote.date || metadata.price !== quote.price.toFixed(2)
  );
}
