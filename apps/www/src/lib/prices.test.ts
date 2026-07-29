import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DailyPriceFile } from "./prices";
import {
  calculateDailyChange,
  classifyPriceData,
  dataUrl,
  manifestUrl,
  shanghaiDate,
  validPriceObservations,
} from "./prices";

function fileWith(
  entries: Array<{ hour: number; slot: number; value: number | null }>,
  date = "2026-07-29",
): DailyPriceFile {
  const prices = Array.from({ length: 24 }, () =>
    Array<number | null>(12).fill(null),
  );
  for (const entry of entries) {
    prices[entry.hour]![entry.slot] = entry.value;
  }
  return { date, unit: "CNY/g", prices };
}

describe("validPriceObservations", () => {
  it("rejects legacy grids that cannot be labeled safely", () => {
    const file = fileWith([]);
    file.prices[0] = Array<number | null>(6).fill(null);

    assert.throws(
      () => validPriceObservations(file),
      /Expected 24 rows of 12 price slots/,
    );
  });

  it("keeps only finite values and converts Shanghai wall time", () => {
    const observations = validPriceObservations(
      fileWith([
        { hour: 9, slot: 6, value: 876.5 },
        { hour: 9, slot: 7, value: null },
        { hour: 9, slot: 11, value: Number.NaN },
        { hour: 10, slot: 0, value: 878.9 },
      ]),
    );

    assert.deepEqual(observations, [
      {
        label: "09:30",
        time: Date.parse("2026-07-29T09:30:00+08:00") / 1000,
        value: 876.5,
      },
      {
        label: "10:00",
        time: Date.parse("2026-07-29T10:00:00+08:00") / 1000,
        value: 878.9,
      },
    ]);
  });
});

describe("calculateDailyChange", () => {
  it("returns null with fewer than two observations", () => {
    assert.equal(calculateDailyChange([]), null);
    assert.equal(
      calculateDailyChange([{ label: "09:30", time: 1, value: 876.5 }]),
      null,
    );
  });

  it("calculates change from the first to latest observation", () => {
    const change = calculateDailyChange([
      { label: "09:30", time: 1, value: 876.5 },
      { label: "14:30", time: 2, value: 878.9 },
    ]);

    assert.ok(change);
    assert.ok(Math.abs(change.absolute - 2.4) < 1e-9);
    assert.ok(Math.abs(change.percentage! - (2.4 / 876.5) * 100) < 1e-9);
  });

  it("returns no percentage when the first value is zero", () => {
    assert.deepEqual(
      calculateDailyChange([
        { label: "09:30", time: 1, value: 0 },
        { label: "09:40", time: 2, value: 1 },
      ]),
      { absolute: 1, percentage: null },
    );
  });

  it("preserves negative and unchanged direction", () => {
    assert.deepEqual(
      calculateDailyChange([
        { label: "09:30", time: 1, value: 880 },
        { label: "09:40", time: 2, value: 878 },
      ]),
      { absolute: -2, percentage: (-2 / 880) * 100 },
    );
    assert.deepEqual(
      calculateDailyChange([
        { label: "09:30", time: 1, value: 878 },
        { label: "09:40", time: 2, value: 878 },
      ]),
      { absolute: 0, percentage: 0 },
    );
  });
});

describe("Shanghai date and state classification", () => {
  it("calculates the calendar date in Asia/Shanghai", () => {
    assert.equal(shanghaiDate(new Date("2026-07-28T16:30:00Z")), "2026-07-29");
  });

  it("distinguishes empty, sparse, ready, and stale files", () => {
    assert.equal(classifyPriceData(fileWith([]), "2026-07-29"), "empty");
    assert.equal(
      classifyPriceData(
        fileWith([{ hour: 14, slot: 3, value: 878.9 }]),
        "2026-07-29",
      ),
      "sparse",
    );
    assert.equal(
      classifyPriceData(
        fileWith([
          { hour: 14, slot: 3, value: 878.9 },
          { hour: 14, slot: 4, value: 879.1 },
        ]),
        "2026-07-29",
      ),
      "ready",
    );
    assert.equal(
      classifyPriceData(
        fileWith([{ hour: 14, slot: 3, value: 878.9 }], "2026-07-28"),
        "2026-07-29",
      ),
      "stale",
    );
  });
});

describe("data URLs", () => {
  it("preserves the GitHub Pages base path", () => {
    assert.equal(
      manifestUrl("/golden-price/"),
      "/golden-price/data/manifest.json",
    );
    assert.equal(
      dataUrl("/golden-price", "jingjinjin.cn", "2026-07-29"),
      "/golden-price/data/jingjinjin.cn/2026-07-29.json",
    );
  });
});
