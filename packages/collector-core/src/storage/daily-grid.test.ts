import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  createDailyFile,
  dayFilePath,
  saveDailyFile,
  writeSlot,
  type DailyPriceFile,
} from "./daily-grid.js";

const tempRoots: string[] = [];

afterEach(async () => {
  delete process.env.GOLDEN_PRICE_DATA_ROOT;
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function withTempDataRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "golden-price-"));
  tempRoots.push(dir);
  process.env.GOLDEN_PRICE_DATA_ROOT = dir;
  return dir;
}

describe("writeSlot gap fill", () => {
  it("fills earlier null slots on the same day with the last known price", async () => {
    await withTempDataRoot();
    const key = "test-channel";
    const date = "2026-07-29";

    const prior = createDailyFile("2026-07-28");
    prior.prices[23][5] = 800;
    await saveDailyFile(key, prior);

    await writeSlot(key, date, 1, 2, 810);

    const raw = await readFile(dayFilePath(key, date), "utf8");
    const file = JSON.parse(raw) as DailyPriceFile;

    assert.equal(file.prices[0][0], 800);
    assert.equal(file.prices[1][1], 800);
    assert.equal(file.prices[1][2], 810);
    assert.equal(file.prices[1][3], null);
  });

  it("does not overwrite existing non-null slots", async () => {
    await withTempDataRoot();
    const key = "test-channel";
    const date = "2026-07-29";

    await writeSlot(key, date, 0, 1, 700);
    await writeSlot(key, date, 0, 3, 720);

    const raw = await readFile(dayFilePath(key, date), "utf8");
    const file = JSON.parse(raw) as DailyPriceFile;

    assert.equal(file.prices[0][0], 700);
    assert.equal(file.prices[0][1], 700);
    assert.equal(file.prices[0][2], 700);
    assert.equal(file.prices[0][3], 720);
  });
});

describe("dayFilePath", () => {
  it("writes under GOLDEN_PRICE_DATA_ROOT when set", async () => {
    const root = await withTempDataRoot();
    const filePath = dayFilePath("jingjinjin.cn", "2026-07-29");
    assert.equal(filePath, path.join(root, "jingjinjin.cn", "2026-07-29.json"));
  });
});
