import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { ogFontBytes } from "./og-font-data.js";
import {
  changeTone,
  formatSigned,
  type OgObservation,
  type OgQuote,
} from "./og-quote.js";

export const OG_IMAGE_KEY = "og/latest.png";
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

let wasmReady: Promise<void> | null = null;

function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasm).then(() => undefined);
  }
  return wasmReady;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sparklinePath(
  observations: OgObservation[],
  area: { x: number; y: number; width: number; height: number },
): { line: string; area: string } | null {
  if (observations.length === 0) return null;
  const values = observations.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.01);
  const step =
    observations.length === 1 ? 0 : area.width / (observations.length - 1);

  const points = observations.map((item, index) => {
    const x =
      observations.length === 1
        ? area.x + area.width / 2
        : area.x + index * step;
    const y =
      area.y + area.height - ((item.value - min) / span) * area.height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const first = points[0]!;
  const last = points.at(-1)!;
  const [lastX] = last.split(",");
  const [firstX] = first.split(",");
  const bottom = area.y + area.height;
  return {
    line: `M ${first} L ${points.slice(1).join(" ")}`,
    area: `M ${firstX},${bottom} L ${points.join(" ")} L ${lastX},${bottom} Z`,
  };
}

export function buildOgSvg(quote: OgQuote): string {
  const tone =
    quote.absoluteChange === null
      ? "flat"
      : changeTone(quote.absoluteChange);
  const changeColor =
    tone === "up" ? "#62d39a" : tone === "down" ? "#ef6f72" : "#74777f";
  const changeText =
    quote.absoluteChange === null
      ? "暂无今日涨跌"
      : `${tone === "up" ? "↑ " : tone === "down" ? "↓ " : ""}${formatSigned(
          quote.absoluteChange,
        )}${
          quote.percentageChange === null
            ? ""
            : ` · ${formatSigned(quote.percentageChange)}%`
        }  今日`;

  const spark = sparklinePath(quote.observations, {
    x: 96,
    y: 380,
    width: OG_WIDTH - 192,
    height: 120,
  });

  const price = quote.price.toFixed(2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <radialGradient id="glow" cx="78%" cy="42%" r="42%">
      <stop offset="0%" stop-color="#d2a430" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#d2a430" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#edc652" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#edc652" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#101116"/>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#glow)"/>
  <rect x="48" y="48" width="${OG_WIDTH - 96}" height="${OG_HEIGHT - 96}" rx="28" ry="28" fill="none" stroke="rgba(237,198,82,0.22)" stroke-width="2"/>
  <text x="96" y="130" fill="#edc652" font-family="Alibaba PuHuiTi R" font-size="28" font-weight="700">黄金 · CNY</text>
  <text x="${OG_WIDTH - 96}" y="130" fill="#74777f" font-family="Alibaba PuHuiTi R" font-size="24" text-anchor="end">${escapeXml(quote.source)}</text>
  <text x="96" y="278" fill="#f4f0e6" font-family="Alibaba PuHuiTi R" font-size="108" font-weight="700">${price}<tspan fill="#74777f" font-size="28" dx="24">元 / 克</tspan></text>
  <text x="96" y="340" fill="${changeColor}" font-family="Alibaba PuHuiTi R" font-size="32" font-weight="700">${escapeXml(changeText)}</text>
  ${
    spark
      ? `<path d="${spark.area}" fill="url(#fill)"/><path d="${spark.line}" fill="none" stroke="#edc652" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
      : ""
  }
  <text x="96" y="560" fill="#74777f" font-family="Alibaba PuHuiTi R" font-size="24">${escapeXml(quote.updatedLabel)}</text>
  <text x="${OG_WIDTH - 96}" y="560" fill="#edc652" font-family="Alibaba PuHuiTi R" font-size="24" text-anchor="end">gold.yuler.dev</text>
</svg>`;
}

export async function renderOgPng(quote: OgQuote): Promise<Uint8Array> {
  await ensureWasm();
  const svg = buildOgSvg(quote);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_WIDTH },
    font: {
      fontBuffers: [ogFontBytes()],
      defaultFontFamily: "Alibaba PuHuiTi R",
    },
  });
  const image = resvg.render();
  try {
    return image.asPng();
  } finally {
    image.free();
    resvg.free();
  }
}

export async function writeOgImage(
  bucket: R2Bucket,
  quote: OgQuote,
): Promise<void> {
  const png = await renderOgPng(quote);
  await bucket.put(OG_IMAGE_KEY, png, {
    httpMetadata: {
      contentType: "image/png",
      cacheControl: "public, max-age=300",
    },
    customMetadata: {
      date: quote.date,
      price: quote.price.toFixed(2),
      updatedLabel: quote.updatedLabel,
    },
  });
}

export async function readOgImage(
  bucket: R2Bucket,
): Promise<R2ObjectBody | null> {
  return bucket.get(OG_IMAGE_KEY);
}
