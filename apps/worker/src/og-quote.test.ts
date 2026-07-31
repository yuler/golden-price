import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DailyPriceFile } from "@golden-price/core/worker";
import {
  formatSigned,
  quoteFromDailyFile,
  sourceDisplayName,
} from "./og-quote.js";

function fileWith(
  entries: Array<{ hour: number; slot: number; value: number | null }>,
  date = "2026-07-30",
): DailyPriceFile {
  const prices = Array.from({ length: 24 }, () =>
    Array<number | null>(12).fill(null),
  );
  for (const entry of entries) {
    prices[entry.hour]![entry.slot] = entry.value;
  }
  return { date, unit: "CNY/g", prices };
}

describe("sourceDisplayName", () => {
  it("maps jingjinjin to a short Chinese label", () => {
    assert.equal(sourceDisplayName("jingjinjin.cn"), "京金金");
  });
});

describe("formatSigned", () => {
  it("keeps a leading plus for gains", () => {
    assert.equal(formatSigned(1.25), "+1.25");
    assert.equal(formatSigned(-0.5), "-0.50");
  });
});

describe("quoteFromDailyFile", () => {
  it("returns null when the day has no quotes", () => {
    assert.equal(quoteFromDailyFile(fileWith([]), "jingjinjin.cn"), null);
  });

  it("builds price change and labels from the daily grid", () => {
    const quote = quoteFromDailyFile(
      fileWith([
        { hour: 9, slot: 0, value: 100 },
        { hour: 10, slot: 0, value: 102.5 },
      ]),
      "jingjinjin.cn",
    );

    assert.deepEqual(quote, {
      price: 102.5,
      absoluteChange: 2.5,
      percentageChange: 2.5,
      updatedLabel: "10:00 更新",
      date: "2026-07-30",
      source: "数据源：京金金",
      observations: [
        { label: "09:00", value: 100 },
        { label: "10:00", value: 102.5 },
      ],
    });
  });
});
