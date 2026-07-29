import { gunzipSync } from "node:zlib";

/** Decode jingjinjin STOMP body: Base64 → gzip → UTF-8 JSON text. */
export function decodeJingjinjinBody(body: string): unknown {
  const compressed = Buffer.from(body.trim(), "base64");
  const jsonText = gunzipSync(compressed).toString("utf8");
  return JSON.parse(jsonText) as unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-merge plain objects; arrays and primitives from `patch` win. */
export function deepMerge(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function extractOriginHuangjin(
  state: Record<string, unknown>,
): { cnyPerGram: number; trade: boolean } | null {
  const origin = state.originhuangjin;
  if (!isPlainObject(origin)) return null;

  const prices = origin.prices;
  if (!isPlainObject(prices)) return null;

  const quote = prices.originhuangjin;
  if (!isPlainObject(quote)) return null;

  const huigou = quote.huigou;
  if (typeof huigou !== "number" || !Number.isFinite(huigou)) return null;
  if (typeof state.trade !== "boolean") return null;

  return {
    cnyPerGram: huigou,
    trade: state.trade,
  };
}
