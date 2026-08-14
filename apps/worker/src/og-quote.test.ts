import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOURS,
  JINGJINJIN_STORAGE_KEY,
  SLOTS_PER_HOUR,
  type DailyPriceFile,
} from "@golden-price/core/worker";
import {
  formatSigned,
  isOgStale,
  quoteFromDailyFile,
  sourceDisplayName,
} from "./og-quote.js";

function fileWith(
  entries: Array<{ hour: number; slot: number; value: number | null }>,
  date = "2026-07-30",
): DailyPriceFile {
  const prices = Array.from({ length: HOURS }, () =>
    Array<number | null>(SLOTS_PER_HOUR).fill(null),
  );
  for (const entry of entries) {
    prices[entry.hour]![entry.slot] = entry.value;
  }
  return { date, unit: "CNY/g", prices };
}

describe("sourceDisplayName", () => {
  it("maps jingjinjin to a short Chinese label", () => {
    assert.equal(sourceDisplayName(JINGJINJIN_STORAGE_KEY), "京金金");
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
    assert.equal(quoteFromDailyFile(fileWith([]), JINGJINJIN_STORAGE_KEY), null);
  });

  it("builds price change and labels from the daily grid", () => {
    const quote = quoteFromDailyFile(
      fileWith([
        { hour: 9, slot: 0, value: 100 },
        { hour: 10, slot: 0, value: 102.5 },
      ]),
      JINGJINJIN_STORAGE_KEY,
    );

    assert.deepEqual(quote, {
      price: 102.5,
      absoluteChange: 2.5,
      percentageChange: 2.5,
      updatedLabel: "2026-07-30 10:00 更新",
      date: "2026-07-30",
      source: "数据源：京金金",
      observations: [
        { label: "09:00", value: 100 },
        { label: "10:00", value: 102.5 },
      ],
    });
  });
});

describe("isOgStale", () => {
  const quote = {
    price: 102.5,
    absoluteChange: 2.5,
    percentageChange: 2.5,
    updatedLabel: "2026-07-30 10:00 更新",
    date: "2026-07-30",
    source: "数据源：京金金",
    observations: [{ label: "10:00", value: 102.5 }],
  };

  it("treats missing metadata as stale", () => {
    assert.equal(isOgStale(undefined, quote), true);
  });

  it("matches on date and price, ignoring a newer slot at the same price", () => {
    assert.equal(
      isOgStale(
        {
          date: "2026-07-30",
          price: "102.50",
          updatedLabel: "2026-07-30 09:00 更新",
        },
        quote,
      ),
      false,
    );
    assert.equal(
      isOgStale({ date: "2026-07-30", price: "101.00" }, quote),
      true,
    );
    assert.equal(
      isOgStale({ date: "2026-07-29", price: "102.50" }, quote),
      true,
    );
  });
});
