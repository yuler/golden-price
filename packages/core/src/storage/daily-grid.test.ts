import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { writeSlot, type DailyPriceFile } from "./daily-grid.js";
import { NodeFsDailyPriceStore } from "./node-fs-store.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function withTempStore(): Promise<NodeFsDailyPriceStore> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "golden-price-"));
  tempRoots.push(dir);
  return new NodeFsDailyPriceStore(dir);
}

describe("writeSlot", () => {
  it("writes value at the given cell only", async () => {
    const store = await withTempStore();
    const key = "test-channel";
    const date = "2026-07-29";

    await writeSlot(store, key, date, 1, 2, 810);

    const raw = await readFile(store.dayFilePath(key, date), "utf8");
    const file = JSON.parse(raw) as DailyPriceFile;

    assert.equal(file.prices[0][0], null);
    assert.equal(file.prices[1][1], null);
    assert.equal(file.prices[1][2], 810);
    assert.equal(file.prices[1][3], null);
  });

  it("overwrites existing cell", async () => {
    const store = await withTempStore();
    const key = "test-channel";
    const date = "2026-07-29";

    await writeSlot(store, key, date, 0, 1, 700);
    await writeSlot(store, key, date, 0, 3, 720);

    const raw = await readFile(store.dayFilePath(key, date), "utf8");
    const file = JSON.parse(raw) as DailyPriceFile;

    assert.equal(file.prices[0][0], null);
    assert.equal(file.prices[0][1], 700);
    assert.equal(file.prices[0][2], null);
    assert.equal(file.prices[0][3], 720);
  });

  it("does not erase an existing quote with a null observation", async () => {
    const store = await withTempStore();
    const key = "test-channel";
    const date = "2026-07-29";

    await writeSlot(store, key, date, 0, 1, 700);
    await writeSlot(store, key, date, 0, 1, null);

    const raw = await readFile(store.dayFilePath(key, date), "utf8");
    const file = JSON.parse(raw) as DailyPriceFile;

    assert.equal(file.prices[0][1], 700);
  });
});

describe("NodeFsDailyPriceStore.dayFilePath", () => {
  it("writes under the configured root", async () => {
    const store = await withTempStore();
    const filePath = store.dayFilePath("jingjinjin.cn", "2026-07-29");
    assert.ok(filePath.endsWith(path.join("jingjinjin.cn", "2026-07-29.json")));
  });
});
