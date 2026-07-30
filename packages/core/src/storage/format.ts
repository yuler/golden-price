import type { DailyPriceFile } from "./daily-grid.js";

/** Stable pretty-print for daily price JSON files. */
export function formatDailyFile(file: DailyPriceFile): string {
  const rows = file.prices.map((row) => `    ${JSON.stringify(row)}`);
  return `{\n  "date": ${JSON.stringify(file.date)},\n  "unit": ${JSON.stringify(file.unit)},\n  "prices": [\n${rows.join(",\n")}\n  ]\n}\n`;
}
