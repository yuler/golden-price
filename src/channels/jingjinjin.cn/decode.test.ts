import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractOriginHuangjin } from "./decode.js";

describe("extractOriginHuangjin", () => {
  const withQuote = (extra: Record<string, unknown> = {}) => ({
    originhuangjin: {
      prices: {
        originhuangjin: { huigou: 879.8 },
      },
    },
    ...extra,
  });

  it("returns null until trade is an explicit boolean", () => {
    assert.equal(extractOriginHuangjin(withQuote()), null);
    assert.equal(extractOriginHuangjin(withQuote({ trade: "yes" })), null);
  });

  it("reads trade from the root of the merged state", () => {
    assert.deepEqual(extractOriginHuangjin(withQuote({ trade: true })), {
      cnyPerGram: 879.8,
      trade: true,
    });
    assert.deepEqual(extractOriginHuangjin(withQuote({ trade: false })), {
      cnyPerGram: 879.8,
      trade: false,
    });
  });
});
