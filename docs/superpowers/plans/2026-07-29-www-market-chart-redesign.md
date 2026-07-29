# WWW Market Chart Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ECharts dashboard with a responsive Chinese Liveline market canvas that honestly presents current, sparse, stale, empty, loading, and error data.

**Architecture:** Keep Astro as the static document shell and mount one React dashboard island. Put all market-data derivation in pure helpers, all fetch/state orchestration in `PriceDashboard.tsx`, and all Liveline-specific behavior in `PriceChart.tsx`.

**Tech Stack:** Astro 5, React 18 or newer, TypeScript, Liveline, Node test runner through `tsx --test`, pnpm.

## Global Constraints

- Display only the single existing channel and automatically load its latest available file.
- Do not add channel selection, date selection, multi-day windows, polling, zooming, panning, candlesticks, or technical indicators.
- Only render Liveline when the file date equals today's date in `Asia/Shanghai` and at least two valid observations exist.
- Never carry forward null values, synthesize points, or rebase historical timestamps.
- Use Chinese UI copy with universal codes such as `GOLD` and `CNY` where useful.
- Keep Liveline isolated in `apps/www/src/components/PriceChart.tsx`.
- Disable Liveline momentum arrows, degen mode, window controls, and value overlay.
- Support pointer and touch scrubbing and `prefers-reduced-motion`.
- Preserve the existing static GitHub Pages base-path behavior.
- Do not commit unless the user explicitly authorizes commits during execution.

---

## File Map

### Create

- `apps/www/src/lib/prices.test.ts` — deterministic tests for observation extraction, Shanghai-date state classification, change calculation, and URLs.
- `apps/www/src/components/PriceChart.tsx` — the only Liveline adapter.
- `apps/www/src/components/PriceDashboard.tsx` — fetch lifecycle, state machine, derived display values, and semantic markup.
- `apps/www/src/components/PriceDashboard.css` — approved B1 full-canvas visual system and responsive states.

### Modify

- `apps/www/src/lib/prices.ts` — framework-independent observations, daily change, and state classification.
- `apps/www/package.json` — React/Liveline dependencies and the www test script.
- `apps/www/astro.config.mjs` — register Astro's React integration.
- `apps/www/src/pages/index.astro` — replace the imperative dashboard with the React island.
- `apps/www/src/layouts/Layout.astro` — Chinese metadata and global dark-canvas foundation.
- `README.md` — replace ECharts references with React/Liveline and document the simplified latest-day UI.

### Delete

- `apps/www/src/lib/chart.ts` — obsolete ECharts renderer.
- `apps/www/src/scripts/dashboard.ts` — obsolete imperative DOM/fetch controller.

---

### Task 1: Build the tested price-view model

**Files:**
- Create: `apps/www/src/lib/prices.test.ts`
- Modify: `apps/www/src/lib/prices.ts`
- Modify: `apps/www/package.json`

**Interfaces:**
- Produces: `PriceObservation`, `DailyChange`, and `PriceDataState`.
- Produces: `validPriceObservations(file)`, `calculateDailyChange(observations)`, `shanghaiDate(now)`, and `classifyPriceData(file, today)`.
- Preserves: `flattenDailyPrices`, `latestPrice`, `dataUrl`, and `manifestUrl`.

- [ ] **Step 1: Add the www test command**

Add this script to `apps/www/package.json`:

```json
{
  "scripts": {
    "test": "tsx --test src/lib/prices.test.ts"
  }
}
```

Keep the existing `tsx` development dependency; no new test framework is needed.

- [ ] **Step 2: Write the failing model tests**

Create `apps/www/src/lib/prices.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DailyPriceFile } from "./prices";
import {
  calculateDailyChange,
  classifyPriceData,
  dataUrl,
  manifestUrl,
  shanghaiDate,
  validPriceObservations,
} from "./prices";

function fileWith(
  entries: Array<{ hour: number; slot: number; value: number | null }>,
  date = "2026-07-29",
): DailyPriceFile {
  const prices = Array.from({ length: 24 }, () =>
    Array<number | null>(12).fill(null),
  );
  for (const entry of entries) {
    prices[entry.hour]![entry.slot] = entry.value;
  }
  return { date, unit: "CNY/g", prices };
}

describe("validPriceObservations", () => {
  it("keeps only finite values and converts Shanghai wall time to Unix seconds", () => {
    const observations = validPriceObservations(
      fileWith([
        { hour: 9, slot: 3, value: 876.5 },
        { hour: 9, slot: 4, value: null },
        { hour: 9, slot: 5, value: Number.NaN },
        { hour: 10, slot: 0, value: 878.9 },
      ]),
    );

    assert.deepEqual(observations, [
      {
        label: "09:30",
        time: Date.parse("2026-07-29T09:30:00+08:00") / 1000,
        value: 876.5,
      },
      {
        label: "10:00",
        time: Date.parse("2026-07-29T10:00:00+08:00") / 1000,
        value: 878.9,
      },
    ]);
  });
});

describe("calculateDailyChange", () => {
  it("returns null with fewer than two observations", () => {
    assert.equal(calculateDailyChange([]), null);
    assert.equal(
      calculateDailyChange([
        { label: "09:30", time: 1, value: 876.5 },
      ]),
      null,
    );
  });

  it("calculates absolute and percentage change from first to latest", () => {
    assert.deepEqual(
      calculateDailyChange([
        { label: "09:30", time: 1, value: 876.5 },
        { label: "14:30", time: 2, value: 878.9 },
      ]),
      {
        absolute: 2.3999999999999773,
        percentage: 0.2738163148887595,
      },
    );
  });

  it("returns no percentage when the first value is zero", () => {
    assert.deepEqual(
      calculateDailyChange([
        { label: "09:30", time: 1, value: 0 },
        { label: "09:40", time: 2, value: 1 },
      ]),
      { absolute: 1, percentage: null },
    );
  });

  it("preserves negative and unchanged direction", () => {
    assert.deepEqual(
      calculateDailyChange([
        { label: "09:30", time: 1, value: 880 },
        { label: "09:40", time: 2, value: 878 },
      ]),
      { absolute: -2, percentage: (-2 / 880) * 100 },
    );
    assert.deepEqual(
      calculateDailyChange([
        { label: "09:30", time: 1, value: 878 },
        { label: "09:40", time: 2, value: 878 },
      ]),
      { absolute: 0, percentage: 0 },
    );
  });
});

describe("Shanghai date and state classification", () => {
  it("calculates the calendar date in Asia/Shanghai", () => {
    assert.equal(shanghaiDate(new Date("2026-07-28T16:30:00Z")), "2026-07-29");
  });

  it("distinguishes empty, sparse, ready, and stale files", () => {
    assert.equal(classifyPriceData(fileWith([]), "2026-07-29"), "empty");
    assert.equal(
      classifyPriceData(
        fileWith([{ hour: 14, slot: 3, value: 878.9 }]),
        "2026-07-29",
      ),
      "sparse",
    );
    assert.equal(
      classifyPriceData(
        fileWith([
          { hour: 14, slot: 3, value: 878.9 },
          { hour: 14, slot: 4, value: 879.1 },
        ]),
        "2026-07-29",
      ),
      "ready",
    );
    assert.equal(
      classifyPriceData(
        fileWith([{ hour: 14, slot: 3, value: 878.9 }], "2026-07-28"),
        "2026-07-29",
      ),
      "stale",
    );
  });
});

describe("data URLs", () => {
  it("preserves the GitHub Pages base path", () => {
    assert.equal(
      manifestUrl("/golden-price/"),
      "/golden-price/data/manifest.json",
    );
    assert.equal(
      dataUrl("/golden-price", "jingjinjin.cn", "2026-07-29"),
      "/golden-price/data/jingjinjin.cn/2026-07-29.json",
    );
  });
});
```

- [ ] **Step 3: Run the tests and verify the expected failure**

Run:

```bash
pnpm --filter @golden-price/www test
```

Expected: FAIL because `calculateDailyChange`, `classifyPriceData`, `shanghaiDate`, and `validPriceObservations` are not exported yet.

- [ ] **Step 4: Implement the pure view model**

Add these exports to `apps/www/src/lib/prices.ts`, reusing the existing `flattenDailyPrices` function:

```ts
export interface PriceObservation {
  label: string;
  time: number;
  value: number;
}

export interface DailyChange {
  absolute: number;
  percentage: number | null;
}

export type PriceDataState = "empty" | "sparse" | "ready" | "stale";

export function validPriceObservations(
  file: DailyPriceFile,
): PriceObservation[] {
  return flattenDailyPrices(file).flatMap((point) => {
    if (typeof point.value !== "number" || !Number.isFinite(point.value)) {
      return [];
    }
    const time = Date.parse(`${file.date}T${point.time}:00+08:00`) / 1000;
    return [{ label: point.time, time, value: point.value }];
  });
}

export function calculateDailyChange(
  observations: PriceObservation[],
): DailyChange | null {
  const first = observations[0];
  const latest = observations.at(-1);
  if (!first || !latest || observations.length < 2) return null;

  const absolute = latest.value - first.value;
  return {
    absolute,
    percentage: first.value === 0 ? null : (absolute / first.value) * 100,
  };
}

export function shanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function classifyPriceData(
  file: DailyPriceFile,
  today = shanghaiDate(),
): PriceDataState {
  const observations = validPriceObservations(file);
  if (observations.length === 0) return "empty";
  if (file.date !== today) return "stale";
  if (observations.length === 1) return "sparse";
  return "ready";
}
```

Refactor `latestPrice` to share the new extraction logic:

```ts
export function latestPrice(
  file: DailyPriceFile,
): { time: string; value: number } | null {
  const latest = validPriceObservations(file).at(-1);
  return latest ? { time: latest.label, value: latest.value } : null;
}
```

- [ ] **Step 5: Run model tests and type checking**

Run:

```bash
pnpm --filter @golden-price/www test
pnpm --filter @golden-price/www typecheck
```

Expected: all model tests PASS and Astro reports no type errors.

- [ ] **Step 6: Optional commit checkpoint**

Only if the user explicitly authorizes commits:

```bash
git add apps/www/package.json apps/www/src/lib/prices.ts apps/www/src/lib/prices.test.ts
git commit -m "test(www): define honest intraday price states"
```

---

### Task 2: Add React and isolate Liveline

**Files:**
- Modify: `apps/www/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/www/astro.config.mjs`
- Create: `apps/www/src/components/PriceChart.tsx`

**Interfaces:**
- Consumes: `PriceObservation[]` from Task 1.
- Produces: `PriceChart({ observations, latestValue, summary })`.

- [ ] **Step 1: Install the current package releases**

Run:

```bash
pnpm --filter @golden-price/www add @astrojs/react@^4.4.2 react react-dom liveline
pnpm --filter @golden-price/www add -D @types/react @types/react-dom
```

Expected: dependencies and `pnpm-lock.yaml` update successfully without peer-dependency errors.

- [ ] **Step 2: Register the React integration**

Replace `apps/www/astro.config.mjs` with:

```js
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  site: "https://yuler.github.io",
  output: "static",
  integrations: [react()],
});
```

Set Astro's required automatic React JSX runtime in `apps/www/tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

- [ ] **Step 3: Create the Liveline adapter**

Create `apps/www/src/components/PriceChart.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Liveline } from "liveline";
import type { PriceObservation } from "../lib/prices";

interface PriceChartProps {
  observations: PriceObservation[];
  latestValue: number;
  summary: string;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function PriceChart({
  observations,
  latestValue,
  summary,
}: PriceChartProps) {
  const reducedMotion = useReducedMotion();
  const windowSeconds = useMemo(() => {
    const first = observations[0]?.time ?? Date.now() / 1000;
    return Math.max(60 * 60, Math.ceil(Date.now() / 1000 - first + 15 * 60));
  }, [observations]);

  return (
    <div className="price-chart" role="img" aria-label={summary}>
      <Liveline
        data={observations}
        value={latestValue}
        theme="dark"
        color="#edc652"
        window={windowSeconds}
        grid
        fill
        scrub
        exaggerate
        badge={false}
        momentum={false}
        pulse={false}
        paused
        degen={false}
        showValue={false}
        lerpSpeed={reducedMotion ? 1 : 0.08}
        formatValue={(value) => `${value.toFixed(2)} 元/克`}
        formatTime={(timestamp) =>
          timeFormatter.format(new Date(timestamp * 1000))
        }
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Type-check the isolated adapter**

Run:

```bash
pnpm --filter @golden-price/www typecheck
```

Expected: PASS, including Liveline prop and React JSX types.

- [ ] **Step 5: Optional commit checkpoint**

Only if the user explicitly authorizes commits:

```bash
git add apps/www/package.json apps/www/astro.config.mjs apps/www/src/components/PriceChart.tsx pnpm-lock.yaml
git commit -m "feat(www): add isolated Liveline chart adapter"
```

---

### Task 3: Replace the dashboard with the approved React market canvas

**Files:**
- Create: `apps/www/src/components/PriceDashboard.tsx`
- Create: `apps/www/src/components/PriceDashboard.css`
- Modify: `apps/www/src/pages/index.astro`
- Modify: `apps/www/src/layouts/Layout.astro`
- Delete: `apps/www/src/lib/chart.ts`
- Delete: `apps/www/src/scripts/dashboard.ts`
- Modify: `apps/www/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `PriceChart` from Task 2 and all model helpers from Task 1.
- Produces: `PriceDashboard({ base })`, the page's only client island.

- [ ] **Step 1: Implement the dashboard state machine and semantic markup**

Create `apps/www/src/components/PriceDashboard.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calculateDailyChange,
  classifyPriceData,
  dataUrl,
  manifestUrl,
  shanghaiDate,
  validPriceObservations,
  type DailyPriceFile,
  type DataManifest,
} from "../lib/prices";
import { PriceChart } from "./PriceChart";
import "./PriceDashboard.css";

interface PriceDashboardProps {
  base: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; channelId: string; file: DailyPriceFile };

function sourceName(channelId: string): string {
  return channelId === "jingjinjin.cn" ? "京金金" : channelId;
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
}

function changeTone(value: number): "up" | "down" | "flat" {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

export function PriceDashboard({ base }: PriceDashboardProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    setLoadState({ kind: "loading" });
    try {
      const manifestResponse = await fetch(manifestUrl(base), {
        cache: "no-store",
      });
      if (!manifestResponse.ok) {
        throw new Error(`数据索引加载失败（${manifestResponse.status}）`);
      }

      const manifest = (await manifestResponse.json()) as DataManifest;
      const channel = manifest.channels[0];
      if (!channel?.latestDate) {
        setLoadState({ kind: "empty" });
        return;
      }

      const dailyResponse = await fetch(
        dataUrl(base, channel.id, channel.latestDate),
        { cache: "no-store" },
      );
      if (!dailyResponse.ok) {
        throw new Error(`今日报价加载失败（${dailyResponse.status}）`);
      }

      setLoadState({
        kind: "loaded",
        channelId: channel.id,
        file: (await dailyResponse.json()) as DailyPriceFile,
      });
    } catch (error) {
      setLoadState({
        kind: "error",
        message: error instanceof Error ? error.message : "报价加载失败",
      });
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState.kind === "loading") {
    return (
      <main className="market-page" aria-busy="true" aria-live="polite">
        <MarketHeader source="数据加载中" />
        <section className="quote-block quote-block--loading">
          <span className="skeleton skeleton--price" />
          <span className="skeleton skeleton--change" />
        </section>
        <div className="chart-state">
          <p>正在加载今日金价…</p>
        </div>
        <MarketFooter left="正在更新" />
      </main>
    );
  }

  if (loadState.kind === "error") {
    return (
      <main className="market-page" aria-live="assertive">
        <MarketHeader source="数据源：京金金" />
        <div className="chart-state chart-state--error">
          <p>{loadState.message}</p>
          <button type="button" onClick={() => void load()}>
            重试
          </button>
        </div>
        <MarketFooter left="更新失败" />
      </main>
    );
  }

  if (loadState.kind === "empty") {
    return (
      <main className="market-page" aria-live="polite">
        <MarketHeader source="数据源：京金金" />
        <div className="chart-state">
          <p>今日暂无报价</p>
        </div>
        <MarketFooter left="等待首次采集" />
      </main>
    );
  }

  return (
    <LoadedDashboard
      channelId={loadState.channelId}
      file={loadState.file}
    />
  );
}

function LoadedDashboard({
  channelId,
  file,
}: {
  channelId: string;
  file: DailyPriceFile;
}) {
  const observations = useMemo(() => validPriceObservations(file), [file]);
  const state = classifyPriceData(file, shanghaiDate());
  const latest = observations.at(-1);
  const change = state === "ready" ? calculateDailyChange(observations) : null;
  const tone = change ? changeTone(change.absolute) : "flat";
  const updated = latest
    ? `${state === "stale" ? `${file.date} ` : ""}${latest.label} 更新`
    : "暂无更新时间";
  const summary = latest
    ? `黄金最新价格 ${latest.value.toFixed(2)} 元每克，${updated}`
    : "今日暂无黄金报价";

  return (
    <main className="market-page" aria-live="polite">
      <MarketHeader source={`数据源：${sourceName(channelId)}`} />

      {latest ? (
        <section className="quote-block" aria-label={summary}>
          <p className="latest-price">
            {latest.value.toFixed(2)}
            <span>元 / 克</span>
          </p>
          {change ? (
            <p className="daily-change" data-tone={tone}>
              {tone === "up" ? "↑ " : tone === "down" ? "↓ " : ""}
              {formatSigned(change.absolute)}
              {change.percentage === null
                ? ""
                : ` · ${formatSigned(change.percentage)}%`}
              <span> 今日</span>
            </p>
          ) : (
            <p className="daily-change" data-tone="flat">
              {state === "stale"
                ? "数据已过期，暂不显示今日涨跌"
                : "今日涨跌需至少两个报价"}
            </p>
          )}
        </section>
      ) : null}

      {state === "ready" && latest ? (
        <PriceChart
          observations={observations}
          latestValue={latest.value}
          summary={summary}
        />
      ) : (
        <div className="chart-state">
          {state === "sparse" ? <span className="single-point" /> : null}
          <p>
            {state === "empty"
              ? "今日暂无报价"
              : state === "stale"
                ? `最后报价来自 ${file.date}，等待今日数据`
                : "正在积累今日走势"}
          </p>
          {state === "sparse" && latest ? (
            <small>首个报价记录于 {latest.label}</small>
          ) : null}
        </div>
      )}

      <MarketFooter left={updated} />
    </main>
  );
}

function MarketHeader({ source }: { source: string }) {
  return (
    <header className="market-header">
      <p>黄金 · CNY</p>
      <span>{source}</span>
    </header>
  );
}

function MarketFooter({ left }: { left: string }) {
  return (
    <footer className="market-footer">
      <span>{left}</span>
      <span>每 5 分钟采集 · 上海时间</span>
    </footer>
  );
}
```

- [ ] **Step 2: Implement the approved responsive B1 styling**

Create `apps/www/src/components/PriceDashboard.css`:

```css
.market-page {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(16rem, 1fr) auto;
  width: min(76rem, 100%);
  min-height: 100svh;
  margin: 0 auto;
  padding: clamp(1.25rem, 4vw, 2.5rem);
  overflow: hidden;
}

.market-page::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background:
    radial-gradient(circle at 80% 44%, rgb(210 164 48 / 16%), transparent 38%),
    radial-gradient(circle at 15% 0%, rgb(255 255 255 / 4%), transparent 31%);
  content: "";
  pointer-events: none;
}

.market-header,
.market-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.market-header p {
  margin: 0;
  color: var(--gold);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.market-header span,
.market-footer {
  color: var(--muted);
  font-size: 0.68rem;
}

.quote-block {
  align-self: end;
  margin-top: clamp(3.5rem, 10vh, 7rem);
}

.latest-price {
  margin: 0;
  color: var(--text);
  font-size: clamp(3.25rem, 9vw, 5.5rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.06em;
  line-height: 0.95;
}

.latest-price span {
  margin-left: 0.65rem;
  color: var(--muted);
  font-size: clamp(0.78rem, 2vw, 0.95rem);
  font-weight: 500;
  letter-spacing: 0;
}

.daily-change {
  margin: 1rem 0 0;
  font-size: 0.84rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.daily-change[data-tone="up"] {
  color: var(--up);
}

.daily-change[data-tone="down"] {
  color: var(--down);
}

.daily-change[data-tone="flat"] {
  color: var(--muted);
  font-weight: 500;
}

.daily-change span {
  color: currentColor;
  opacity: 0.62;
}

.price-chart {
  width: 100%;
  min-height: 17rem;
  margin-top: clamp(1.5rem, 5vh, 3rem);
  filter: drop-shadow(0 0 0.6rem rgb(237 198 82 / 20%));
}

.chart-state {
  position: relative;
  display: grid;
  place-content: center;
  min-height: 17rem;
  margin-top: clamp(1.5rem, 5vh, 3rem);
  color: var(--muted);
  text-align: center;
}

.chart-state::before {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgb(237 198 82 / 18%),
    transparent
  );
  content: "";
}

.chart-state p,
.chart-state small,
.chart-state button {
  position: relative;
}

.chart-state p {
  margin: 0;
  padding: 0.65rem 0.8rem;
  background: var(--bg);
  font-size: 0.8rem;
}

.chart-state small {
  margin-top: 0.35rem;
  font-size: 0.68rem;
  opacity: 0.72;
}

.single-point {
  position: absolute;
  z-index: 1;
  top: calc(50% - 2rem);
  left: calc(50% - 0.25rem);
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 0.9rem rgb(237 198 82 / 55%);
}

.chart-state--error button {
  justify-self: center;
  margin-top: 0.75rem;
  border: 1px solid rgb(237 198 82 / 42%);
  border-radius: 999px;
  background: transparent;
  color: var(--gold);
  padding: 0.55rem 1rem;
  font: inherit;
  cursor: pointer;
}

.chart-state--error button:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
}

.market-footer {
  align-self: end;
  padding-top: 1.25rem;
}

.quote-block--loading {
  display: grid;
  gap: 1rem;
}

.skeleton {
  display: block;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgb(255 255 255 / 5%),
    rgb(255 255 255 / 11%),
    rgb(255 255 255 / 5%)
  );
  background-size: 200% 100%;
  animation: skeleton-shift 1.5s ease-in-out infinite;
}

.skeleton--price {
  width: min(22rem, 72vw);
  height: clamp(3.25rem, 9vw, 5.5rem);
}

.skeleton--change {
  width: 10rem;
  height: 0.9rem;
}

@keyframes skeleton-shift {
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 40rem) {
  .market-page {
    grid-template-rows: auto auto minmax(14rem, 1fr) auto;
    padding: 1.35rem 1.1rem;
  }

  .market-header span {
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .latest-price span {
    display: block;
    margin: 0.7rem 0 0;
  }

  .price-chart,
  .chart-state {
    min-height: 14rem;
  }

  .market-footer {
    align-items: flex-end;
  }

  .market-footer span:last-child {
    max-width: 52%;
    text-align: right;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
```

- [ ] **Step 3: Mount the React island and remove the old dashboard markup**

Replace `apps/www/src/pages/index.astro` with:

```astro
---
import PriceDashboard from "../components/PriceDashboard";
import Layout from "../layouts/Layout.astro";

const base = import.meta.env.BASE_URL;
---

<Layout title="今日金价">
  <PriceDashboard client:load base={base} />
</Layout>
```

Export the dashboard as default by adding this final line to `PriceDashboard.tsx`:

```ts
export default PriceDashboard;
```

- [ ] **Step 4: Update the global document shell**

Change `apps/www/src/layouts/Layout.astro` to use:

```astro
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="每五分钟采集一次的人民币黄金克价与当日走势。"
    />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```

Replace the global style block with:

```css
:root {
  color-scheme: dark;
  --bg: #101116;
  --text: #f4f0e6;
  --muted: #74777f;
  --gold: #edc652;
  --up: #62d39a;
  --down: #ef6f72;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-width: 20rem;
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family:
    Inter,
    "PingFang SC",
    "Microsoft YaHei",
    "Segoe UI",
    system-ui,
    -apple-system,
    sans-serif;
  line-height: 1.5;
}

button,
input,
select {
  font: inherit;
}
```

- [ ] **Step 5: Remove ECharts and obsolete modules**

Run:

```bash
pnpm --filter @golden-price/www remove echarts
```

Delete:

```text
apps/www/src/lib/chart.ts
apps/www/src/scripts/dashboard.ts
```

- [ ] **Step 6: Run all www checks**

Run:

```bash
pnpm --filter @golden-price/www test
pnpm --filter @golden-price/www typecheck
pnpm --filter @golden-price/www build
```

Expected: tests PASS, Astro reports no errors, and the static build completes.

- [ ] **Step 7: Confirm ECharts is gone**

Run:

```bash
rg -n "echarts|renderPriceChart|initDashboard" apps/www pnpm-lock.yaml
```

Expected: no matches.

- [ ] **Step 8: Optional commit checkpoint**

Only if the user explicitly authorizes commits:

```bash
git add apps/www pnpm-lock.yaml
git commit -m "feat(www): redesign latest gold price as a market canvas"
```

---

### Task 4: Verify real states, responsiveness, and documentation

**Files:**
- Modify: `README.md`
- Modify if verification finds a defect: `apps/www/src/components/PriceDashboard.tsx`
- Modify if verification finds a defect: `apps/www/src/components/PriceDashboard.css`
- Modify if verification finds a defect: `apps/www/src/components/PriceChart.tsx`

**Interfaces:**
- Consumes: the complete dashboard from Task 3.
- Produces: verified behavior at required viewports and updated project documentation.

- [ ] **Step 1: Update website and stack documentation**

Replace the website feature list in `README.md` with:

```markdown
- the latest available single-channel gold quote
- today's absolute and percentage change when at least two quotes exist
- a responsive Liveline intraday chart with pointer and touch scrubbing
- honest empty, sparse, stale, loading, and error states
```

Replace the ECharts stack item with:

```markdown
- **React + Liveline** — responsive client-side intraday market chart
```

- [ ] **Step 2: Start the site for manual verification**

Before starting, check whether a www development server is already running. If none is running, run:

```bash
pnpm www:dev
```

Expected: Astro prints a local URL and the page loads without console errors.

- [ ] **Step 3: Verify the current sparse data**

With the repository's current `2026-07-29` file, verify:

- the price is `878.90 元 / 克`;
- the page says today's change requires at least two quotes;
- the chart region shows one point and “正在积累今日走势”;
- no line is drawn;
- the recorded update time is `14:30`;
- there is no channel or date selector.

- [ ] **Step 4: Verify ready, empty, stale, loading, and error fixtures**

Use browser network overrides or temporary local fixture edits, restoring them after each check:

```text
ready: current Shanghai date with two or more finite values
empty: current Shanghai date with all null values
stale: a prior date with at least one finite value
error: block manifest.json or daily JSON in browser devtools
loading: throttle the network before reloading
```

Expected:

- ready renders Liveline and scrub reports exact Shanghai time/value;
- empty renders “今日暂无报价” and no line;
- stale shows the full old date/time, marks data out of date, and draws no line;
- error keeps the canvas shell and the retry button reloads data;
- loading reserves the final layout and does not imitate moving market data.

- [ ] **Step 5: Verify responsive and accessibility behavior**

Check 375 px, 768 px, and 1440 px viewport widths.

Expected:

- no horizontal scrolling or clipped price;
- information order remains price, change/status, chart/state, freshness;
- touch scrub works on a touch-capable viewport;
- retry has a visible keyboard focus ring;
- semantic price text remains available independently of the canvas;
- with reduced motion enabled, the skeleton stops and Liveline transitions become immediate.

- [ ] **Step 6: Run repository-wide verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: every command exits successfully.

- [ ] **Step 7: Review the final diff**

Run:

```bash
git diff --check
git status --short
git diff -- apps/www README.md docs/superpowers/specs/2026-07-29-www-market-chart-design.md docs/superpowers/plans/2026-07-29-www-market-chart-redesign.md
```

Expected: no whitespace errors, no generated `.astro` files staged, and only intentional source, lockfile, documentation, and dependency changes.

- [ ] **Step 8: Optional final commit checkpoint**

Only if the user explicitly authorizes commits:

```bash
git add README.md apps/www pnpm-lock.yaml docs/superpowers/specs/2026-07-29-www-market-chart-design.md docs/superpowers/plans/2026-07-29-www-market-chart-redesign.md
git commit -m "docs(www): document the market chart redesign"
```
