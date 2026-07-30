import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type DailyPriceFile, validateDailyFile } from "./daily-grid.js";
import { formatDailyFile } from "./format.js";
import type { DailyPriceStore } from "./types.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function defaultDataRoot(): string {
  return process.env.GOLDEN_PRICE_DATA_ROOT
    ? path.resolve(process.env.GOLDEN_PRICE_DATA_ROOT)
    : path.join(REPO_ROOT, "data");
}

export class NodeFsDailyPriceStore implements DailyPriceStore {
  constructor(private readonly root: string = defaultDataRoot()) {}

  dayFilePath(storageKey: string, date: string): string {
    return path.join(this.root, storageKey, `${date}.json`);
  }

  async load(
    storageKey: string,
    date: string,
  ): Promise<DailyPriceFile | null> {
    const filePath = this.dayFilePath(storageKey, date);
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as DailyPriceFile;
      validateDailyFile(parsed, date);
      return parsed;
    } catch (error: unknown) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async save(storageKey: string, file: DailyPriceFile): Promise<string> {
    const filePath = this.dayFilePath(storageKey, file.date);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, formatDailyFile(file), "utf8");
    return filePath;
  }

  async listDates(storageKey: string): Promise<string[]> {
    const channelDir = path.join(this.root, storageKey);
    try {
      const entries = await readdir(channelDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name.replace(/\.json$/, ""))
        .sort();
    } catch (error: unknown) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  async listChannels(): Promise<string[]> {
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      const channels: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dates = await this.listDates(entry.name);
        if (dates.length > 0) channels.push(entry.name);
      }
      return channels.sort();
    } catch (error: unknown) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }
}

/** Shared default store for CLI / local collect. */
let defaultStore: DailyPriceStore | undefined;

export function getDefaultStore(): DailyPriceStore {
  defaultStore ??= new NodeFsDailyPriceStore();
  return defaultStore;
}

/** Test helper: reset cached default after changing GOLDEN_PRICE_DATA_ROOT. */
export function resetDefaultStore(): void {
  defaultStore = undefined;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT"
  );
}
