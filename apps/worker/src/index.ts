import { DurableObject } from "cloudflare:workers";
import {
  JINGJINJIN_STORAGE_KEY,
  collectJingjinjin,
} from "@golden-price/core/worker";
import { corsHeaders, jsonResponse } from "./cors.js";
import { writeManifest } from "./manifest.js";
import { OG_IMAGE_KEY, writeOgImage } from "./og-image.js";
import { isOgStale, quoteFromDailyFile } from "./og-quote.js";
import { MANIFEST_KEY, R2DailyPriceStore } from "./r2-store.js";

export interface Env {
  GOLDEN_PRICE_DATA: R2Bucket;
  COLLECT_TOKEN?: string;
  COLLECTOR: DurableObjectNamespace<PriceCollector>;
}

const DATA_DAY_PATH =
  /^\/data\/([^/]+)\/(\d{4}-\d{2}-\d{2})\.json$/;
const COLLECT_EVERY_MS = 5 * 60 * 1000;

function nextCollectAt(now = Date.now()): number {
  return Math.floor(now / COLLECT_EVERY_MS) * COLLECT_EVERY_MS + COLLECT_EVERY_MS;
}

export class PriceCollector extends DurableObject<Env> {
  async ensureAlarm(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null) {
      await this.ctx.storage.setAlarm(nextCollectAt());
    }
  }

  async kick(): Promise<{
    path: string;
    date: string;
    hour: number;
    slot: number;
    value: number | null;
    trade: boolean;
    nextAlarm: number;
  }> {
    const summary = await runCollect(this.env);
    const nextAlarm = nextCollectAt();
    await this.ctx.storage.setAlarm(nextAlarm);
    return { ...summary, nextAlarm };
  }

  async alarm(): Promise<void> {
    console.log(JSON.stringify({ event: "collector-alarm" }));
    try {
      await runCollect(this.env);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "collect-error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      await this.ctx.storage.setAlarm(nextCollectAt());
    }
  }
}

async function ensureCollector(env: Env): Promise<void> {
  const stub = env.COLLECTOR.get(env.COLLECTOR.idFromName("jingjinjin"));
  await stub.ensureAlarm();
}

async function kickCollector(env: Env) {
  const stub = env.COLLECTOR.get(env.COLLECTOR.idFromName("jingjinjin"));
  return stub.kick();
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/collect") {
      if (request.method !== "GET" && request.method !== "POST") {
        return jsonResponse(
          JSON.stringify({ error: "Method not allowed" }),
          request,
          405,
        );
      }
      return handleCollect(request, env);
    }

    if (request.method !== "GET") {
      return jsonResponse(
        JSON.stringify({ error: "Method not allowed" }),
        request,
        405,
      );
    }

    const store = new R2DailyPriceStore(env.GOLDEN_PRICE_DATA);

    if (url.pathname === "/og.png") {
      return serveOgImage(env, store, request);
    }

    if (url.pathname === "/data/manifest.json") {
      ctx.waitUntil(ensureCollector(env));
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
      await ensureCollector(env);
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
    ctx.waitUntil(ensureCollector(env));
    try {
      await runCollect(env);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "collect-error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }
  },
};

async function handleCollect(request: Request, env: Env): Promise<Response> {
  const token = env.COLLECT_TOKEN;
  const authorized =
    typeof token === "string" &&
    token.length > 0 &&
    request.headers.get("Authorization") === `Bearer ${token}`;
  if (!authorized) {
    return jsonResponse(JSON.stringify({ error: "Unauthorized" }), request, 401);
  }

  try {
    const summary = await kickCollector(env);
    return jsonResponse(JSON.stringify(summary), request);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "collect-error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return jsonResponse(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Collect failed",
      }),
      request,
      500,
    );
  }
}

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

async function runCollect(env: Env): Promise<{
  path: string;
  date: string;
  hour: number;
  slot: number;
  value: number | null;
  trade: boolean;
}> {
  const store = new R2DailyPriceStore(env.GOLDEN_PRICE_DATA);
  const result = await collectJingjinjin(store);
  await writeManifest(store);

  const summary = {
    path: result.path,
    date: result.date,
    hour: result.hour,
    slot: result.slot,
    value: result.value,
    trade: result.trade,
  };

  console.log(JSON.stringify({ event: "collect", ...summary }));
  return summary;
}
