import type { DailyChange, PriceObservation } from "./prices";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

export interface ShareCardInput {
  price: number;
  change: DailyChange | null;
  updatedLabel: string;
  date: string;
  source: string;
  observations: PriceObservation[];
  siteLabel?: string;
}

export type ShareResult = "shared" | "unsupported" | "aborted" | "failed";

export function shareCardFilename(date: string): string {
  return `jin-jia-${date}.png`;
}

export function formatSigned(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
}

export function changeTone(value: number): "up" | "down" | "flat" {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

export function canShareFiles(file: File): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function"
  ) {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function shareCardFile(
  file: File,
  title: string,
  text: string,
): Promise<ShareResult> {
  if (!canShareFiles(file)) return "unsupported";
  try {
    await navigator.share({ files: [file], title, text });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "aborted";
    }
    return "failed";
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawSparkline(
  ctx: CanvasRenderingContext2D,
  observations: PriceObservation[],
  area: { x: number; y: number; width: number; height: number },
  color: string,
): void {
  if (observations.length === 0) return;

  const values = observations.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.01);
  const step =
    observations.length === 1
      ? 0
      : area.width / (observations.length - 1);

  const points = observations.map((item, index) => {
    const x =
      observations.length === 1
        ? area.x + area.width / 2
        : area.x + index * step;
    const y =
      area.y + area.height - ((item.value - min) / span) * area.height;
    return { x, y };
  });

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, area.y + area.height);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.lineTo(points.at(-1)!.x, area.y + area.height);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, area.y, 0, area.y + area.height);
  fill.addColorStop(0, "rgba(237, 198, 82, 0.28)");
  fill.addColorStop(1, "rgba(237, 198, 82, 0)");
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const last = points.at(-1)!;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export async function renderShareCardBlob(
  input: ShareCardInput,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建分享卡片画布");

  const bg = "#101116";
  const text = "#f4f0e6";
  const muted = "#74777f";
  const gold = "#edc652";
  const up = "#62d39a";
  const down = "#ef6f72";
  const fontFamily =
    'Inter, "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  const glow = ctx.createRadialGradient(940, 280, 40, 940, 280, 420);
  glow.addColorStop(0, "rgba(210, 164, 48, 0.22)");
  glow.addColorStop(1, "rgba(210, 164, 48, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  roundedRect(ctx, 48, 48, SHARE_CARD_WIDTH - 96, SHARE_CARD_HEIGHT - 96, 28);
  ctx.strokeStyle = "rgba(237, 198, 82, 0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = gold;
  ctx.font = `700 28px ${fontFamily}`;
  ctx.fillText("黄金 · CNY", 96, 130);

  ctx.fillStyle = muted;
  ctx.font = `500 24px ${fontFamily}`;
  ctx.textAlign = "right";
  ctx.fillText(input.source, SHARE_CARD_WIDTH - 96, 130);
  ctx.textAlign = "left";

  ctx.fillStyle = text;
  ctx.font = `700 108px ${fontFamily}`;
  const priceText = input.price.toFixed(2);
  ctx.fillText(priceText, 96, 278);
  const priceWidth = ctx.measureText(priceText).width;
  ctx.fillStyle = muted;
  ctx.font = `500 28px ${fontFamily}`;
  ctx.fillText("元 / 克", 96 + priceWidth + 24, 278);

  if (input.change) {
    const tone = changeTone(input.change.absolute);
    ctx.fillStyle =
      tone === "up" ? up : tone === "down" ? down : muted;
    ctx.font = `700 32px ${fontFamily}`;
    const arrow = tone === "up" ? "↑ " : tone === "down" ? "↓ " : "";
    const percent =
      input.change.percentage === null
        ? ""
        : ` · ${formatSigned(input.change.percentage)}%`;
    ctx.fillText(
      `${arrow}${formatSigned(input.change.absolute)}${percent}  今日`,
      96,
      340,
    );
  } else {
    ctx.fillStyle = muted;
    ctx.font = `500 28px ${fontFamily}`;
    ctx.fillText("暂无今日涨跌", 96, 340);
  }

  drawSparkline(
    ctx,
    input.observations,
    { x: 96, y: 380, width: SHARE_CARD_WIDTH - 192, height: 120 },
    gold,
  );

  ctx.fillStyle = muted;
  ctx.font = `500 24px ${fontFamily}`;
  ctx.fillText(input.updatedLabel, 96, 560);
  ctx.textAlign = "right";
  ctx.fillStyle = gold;
  ctx.font = `600 24px ${fontFamily}`;
  ctx.fillText(input.siteLabel ?? "gold.yuler.dev", SHARE_CARD_WIDTH - 96, 560);
  ctx.textAlign = "left";

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("分享卡片导出失败"));
    }, "image/png");
  });
  return blob;
}
