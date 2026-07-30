import { collectJingjinjin } from "@golden-price/core/worker";
import { corsHeaders, jsonResponse } from "./cors.js";
import { writeManifest } from "./manifest.js";
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

async function runCollect(env: Env): Promise<void> {
  const store = new R2DailyPriceStore(env.GOLDEN_PRICE_DATA);
  const result = await collectJingjinjin(store);
  await writeManifest(store);
  console.log(
    JSON.stringify({
      event: "collect",
      path: result.path,
      date: result.date,
      hour: result.hour,
      slot: result.slot,
      value: result.value,
      trade: result.trade,
    }),
  );
}
