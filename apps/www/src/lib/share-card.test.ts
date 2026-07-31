import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  changeTone,
  formatSigned,
  shareCardFilename,
  shareCardUpdatedLabel,
} from "./share-card";

describe("shareCardFilename", () => {
  it("builds a stable download name from the quote date", () => {
    assert.equal(shareCardFilename("2026-07-30"), "jin-jia-2026-07-30.png");
  });
});

describe("shareCardUpdatedLabel", () => {
  it("includes the quote date and slot time", () => {
    assert.equal(
      shareCardUpdatedLabel("2026-07-31", "14:35"),
      "2026-07-31 14:35 更新",
    );
  });
});

describe("createShareProbeFile", () => {
  it("builds a valid PNG signature for capability probes", async () => {
    const { createShareProbeFile } = await import("./share-card");
    const file = createShareProbeFile();
    assert.equal(file.type, "image/png");
    assert.ok(file.size > 8);
    const bytes = new Uint8Array(await file.arrayBuffer());
    assert.deepEqual(
      [...bytes.slice(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
  });
});

describe("formatSigned", () => {
  it("prefixes positive values", () => {
    assert.equal(formatSigned(1.2), "+1.20");
    assert.equal(formatSigned(-0.5), "-0.50");
    assert.equal(formatSigned(0), "0.00");
  });
});

describe("changeTone", () => {
  it("classifies up down and flat", () => {
    assert.equal(changeTone(0.01), "up");
    assert.equal(changeTone(-0.01), "down");
    assert.equal(changeTone(0), "flat");
  });
});
