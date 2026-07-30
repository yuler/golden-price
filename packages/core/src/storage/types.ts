import type { DailyPriceFile } from "./daily-grid.js";

/** Persist and load daily price grids (local fs, R2, etc.). */
export interface DailyPriceStore {
  load(storageKey: string, date: string): Promise<DailyPriceFile | null>;
  /** Persist file; returns a store-specific locator (path or object key). */
  save(storageKey: string, file: DailyPriceFile): Promise<string>;
  listDates(storageKey: string): Promise<string[]>;
  listChannels(): Promise<string[]>;
}
