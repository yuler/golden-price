import type { DailyPriceStore } from "./types.js";

export const HOURS = 24;
export const SLOTS_PER_HOUR = 12;
export const UNIT = "CNY/g";
export const LOOKBACK_DAYS = 7;

export type PriceCell = number | null;
export type PriceGrid = PriceCell[][];

export interface DailyPriceFile {
  date: string;
  unit: string;
  prices: PriceGrid;
}

export interface ShanghaiParts {
  date: string;
  hour: number;
  minute: number;
  slot: number;
}

/** Empty 24×12 grid of nulls. */
export function emptyGrid(): PriceGrid {
  return Array.from({ length: HOURS }, () =>
    Array.from({ length: SLOTS_PER_HOUR }, () => null),
  );
}

/** Slot index 0–11 for five-minute intervals. */
export function slotIndex(minute: number): number {
  return Math.min(SLOTS_PER_HOUR - 1, Math.floor(minute / 5));
}

/** Asia/Shanghai calendar parts for an instant. */
export function shanghaiParts(now: Date = new Date()): ShanghaiParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute,
    slot: slotIndex(minute),
  };
}

export function createDailyFile(date: string): DailyPriceFile {
  return { date, unit: UNIT, prices: emptyGrid() };
}

export async function loadOrCreateDailyFile(
  store: DailyPriceStore,
  storageKey: string,
  date: string,
): Promise<DailyPriceFile> {
  const existing = await store.load(storageKey, date);
  return existing ?? createDailyFile(date);
}

export async function loadDailyFile(
  store: DailyPriceStore,
  storageKey: string,
  date: string,
): Promise<DailyPriceFile | null> {
  return store.load(storageKey, date);
}

export async function saveDailyFile(
  store: DailyPriceStore,
  storageKey: string,
  file: DailyPriceFile,
): Promise<string> {
  return store.save(storageKey, file);
}

/** Write a finite value without erasing an existing quote with null. */
export async function writeSlot(
  store: DailyPriceStore,
  storageKey: string,
  date: string,
  hour: number,
  slot: number,
  value: PriceCell,
): Promise<string> {
  assertHourSlot(hour, slot);
  const file = await loadOrCreateDailyFile(store, storageKey, date);
  if (typeof value === "number" && Number.isFinite(value)) {
    file.prices[hour][slot] = value;
  }
  return store.save(storageKey, file);
}

/**
 * Nearest earlier non-null price before (date, hour, slot),
 * scanning the same day then previous days (up to LOOKBACK_DAYS).
 */
export async function findNearestPreviousPrice(
  store: DailyPriceStore,
  storageKey: string,
  date: string,
  hour: number,
  slot: number,
  lookbackDays: number = LOOKBACK_DAYS,
): Promise<number | null> {
  assertHourSlot(hour, slot);

  const sameDay = await store.load(storageKey, date);
  if (sameDay) {
    const fromSame = scanBackward(sameDay.prices, hour, slot);
    if (fromSame !== null) return fromSame;
  }

  let cursor = date;
  for (let i = 0; i < lookbackDays; i++) {
    cursor = previousDate(cursor);
    const file = await store.load(storageKey, cursor);
    if (!file) continue;
    const found = scanBackward(file.prices, HOURS - 1, SLOTS_PER_HOUR);
    if (found !== null) return found;
  }
  return null;
}

function scanBackward(
  prices: PriceGrid,
  startHour: number,
  startSlotExclusive: number,
): number | null {
  let hour = startHour;
  let slot = startSlotExclusive - 1;
  while (hour >= 0) {
    while (slot >= 0) {
      const cell = prices[hour]?.[slot];
      if (typeof cell === "number" && Number.isFinite(cell)) return cell;
      slot -= 1;
    }
    hour -= 1;
    slot = SLOTS_PER_HOUR - 1;
  }
  return null;
}

export function previousDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const prev = new Date(utc - 24 * 60 * 60 * 1000);
  const yy = prev.getUTCFullYear();
  const mm = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(prev.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function validateDailyFile(
  file: DailyPriceFile,
  expectedDate: string,
): void {
  if (file.date !== expectedDate) {
    throw new Error(
      `Daily file date mismatch: expected ${expectedDate}, got ${file.date}`,
    );
  }
  if (!Array.isArray(file.prices) || file.prices.length !== HOURS) {
    throw new Error(`Daily file must have ${HOURS} hour rows`);
  }
  for (let h = 0; h < HOURS; h++) {
    const row = file.prices[h];
    if (!Array.isArray(row) || row.length !== SLOTS_PER_HOUR) {
      throw new Error(`Hour ${h} must have ${SLOTS_PER_HOUR} slots`);
    }
  }
}

function assertHourSlot(hour: number, slot: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour >= HOURS) {
    throw new Error(`Invalid hour: ${hour}`);
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_HOUR) {
    throw new Error(`Invalid slot: ${slot}`);
  }
}
