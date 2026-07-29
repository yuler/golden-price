import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordedValue } from "./collect.js";

describe("recordedValue", () => {
  it("records an open-market quote", () => {
    assert.equal(recordedValue({ trade: true, cnyPerGram: 879.2 }), 879.2);
  });

  it("does not carry a closed-market quote into a new slot", () => {
    assert.equal(recordedValue({ trade: false, cnyPerGram: 879.2 }), null);
  });
});
