const ALLOWED_ORIGINS = new Set([
  "https://gold.yuler.dev",
  "https://gold.yuler.cc",
  "https://yuler.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

const DEFAULT_ORIGIN = "https://gold.yuler.dev";

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowOrigin =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function jsonResponse(
  body: string,
  request: Request,
  status = 200,
): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
    },
  });
}
