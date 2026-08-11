import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordedValue } from "./collect.js";

describe("recordedValue", () => {
  it("records CNY when present, regardless of trade", () => {
    assert.equal(recordedValue({ cnyPerGram: 879.2 }), 879.2);
  });
});
