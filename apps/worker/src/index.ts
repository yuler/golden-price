import {
  JINGJINJIN_STORAGE_KEY,
  collectJingjinjin,
  type DailyPriceFile,
} from "@golden-price/core/worker";
import { corsHeaders, jsonResponse } from "./cors.js";
import { writeManifest } from "./manifest.js";
import { OG_IMAGE_KEY, writeOgImage } from "./og-image.js";
import { isOgStale, quoteFromDailyFile } from "./og-quote.js";
import { MANIFEST_KEY, R2DailyPriceStore } from "./r2-store.js";

export interface Env {
  GOLDEN_PRICE_DATA: R2Bucket;
}

const DATA_DAY_PATH =
  /^\/data\/([^/]+)\/(\d{4}-\d{2}-\d{2})\.json$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== "GET") {
      return jsonResponse(
        JSON.stringify({ error: "Method not allowed" }),
        request,
        405,
      );
    }

    const url = new URL(request.url);
    const store = new R2DailyPriceStore(env.GOLDEN_PRICE_DATA);

    if (url.pathname === "/og.png") {
      return serveOgImage(env, store, request);
    }

    if (url.pathname === "/data/manifest.json") {
      const raw = await store.getRaw(MANIFEST_KEY);
      if (raw) return jsonResponse(raw, request);
      const manifest = await writeManifest(store);
      return jsonResponse(`${JSON.stringify(manifest, null, 2)}\n`, request);
    }

    const dayMatch = url.pathname.match(DATA_DAY_PATH);
    if (dayMatch) {
      const channelId = decodeURIComponent(dayMatch[1]);
      const date = dayMatch[2];
      const raw = await store.getRaw(store.objectKey(channelId, date));
      if (!raw) {
        return jsonResponse(
          JSON.stringify({ error: "Not found" }),
          request,
          404,
        );
      }
      return jsonResponse(raw, request);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse(
        JSON.stringify({ ok: true, service: "golden-price" }),
        request,
      );
    }

    return jsonResponse(JSON.stringify({ error: "Not found" }), request, 404);
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runCollect(env));
  },
};

async function serveOgImage(
  env: Env,
  store: R2DailyPriceStore,
  request: Request,
): Promise<Response> {
  const bucket = env.GOLDEN_PRICE_DATA;
  try {
    const existing = await bucket.head(OG_IMAGE_KEY);
    const quote = await latestOgQuote(store);
    if (quote && isOgStale(existing?.customMetadata, quote)) {
      await writeOgImage(bucket, quote);
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "og-image-error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  const object = await bucket.get(OG_IMAGE_KEY);
  if (!object) {
    return jsonResponse(
      JSON.stringify({ error: "OG image unavailable" }),
      request,
      404,
    );
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "image/png");
  headers.set("Cache-Control", "public, max-age=300");
  headers.set("ETag", object.httpEtag);
  Object.entries(corsHeaders(request)).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(object.body, { status: 200, headers });
}

async function latestOgQuote(store: R2DailyPriceStore) {
  const channelId = JINGJINJIN_STORAGE_KEY;
  const dates = await store.listDates(channelId);
  const latestDate = dates.at(-1);
  if (!latestDate) return null;

  const file = await store.load(channelId, latestDate);
  if (!file) return null;

  return quoteFromDailyFile(file, channelId);
}

async function writeOgFromFile(
  bucket: R2Bucket,
  file: DailyPriceFile,
  channelId: string,
): Promise<boolean> {
  const quote = quoteFromDailyFile(file, channelId);
  if (!quote) return false;
  await writeOgImage(bucket, quote);
  return true;
}

async function runCollect(env: Env): Promise<void> {
  const store = new R2DailyPriceStore(env.GOLDEN_PRICE_DATA);
  const result = await collectJingjinjin(store);
  await writeManifest(store);

  let ogUpdated = false;
  try {
    const file = await store.load(JINGJINJIN_STORAGE_KEY, result.date);
    if (file) {
      ogUpdated = await writeOgFromFile(
        env.GOLDEN_PRICE_DATA,
        file,
        JINGJINJIN_STORAGE_KEY,
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "og-image-error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  console.log(
    JSON.stringify({
      event: "collect",
      path: result.path,
      date: result.date,
      hour: result.hour,
      slot: result.slot,
      value: result.value,
      trade: result.trade,
      ogUpdated,
      ogKey: OG_IMAGE_KEY,
    }),
  );
}
