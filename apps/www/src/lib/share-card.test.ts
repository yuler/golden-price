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
