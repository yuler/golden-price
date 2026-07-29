# WWW Market Chart Redesign

## Goal

Redesign the static gold-price page so a visitor can understand the latest price, today's change, trend, and data freshness within three seconds. The page should feel like Liveline's immersive dark market view while remaining honest about its five-minute, deployment-based update cycle.

## Scope

The first version:

- displays the single existing gold-price channel;
- automatically loads the latest available date;
- shows one intraday line chart;
- supports pointer and touch scrubbing for exact time and value;
- handles empty, single-point, ready, stale, loading, and error states;
- works equally well on mobile and desktop.

The first version does not include channel selection, date selection, multi-day windows, zooming, panning, candlesticks, technical indicators, live polling, or simulated real-time updates.

## Visual Direction

Use the approved B1 direction: one full-page market canvas without an outer dashboard card.

- Near-black background with a restrained radial gold glow.
- Warm gold line and subtle area fill.
- Latest price is the dominant element.
- Chinese labels are primary; universal market codes such as `GOLD` and `CNY` may remain.
- Source and freshness information are quiet but always visible.
- Avoid particles, chart shake, exaggerated momentum effects, glass panels, dense controls, and decorative dashboard chrome.
- Use tabular numerals for prices and changes.

The desktop composition uses the available width for the chart. Mobile keeps the same information order in a single column rather than introducing a separate compact dashboard.

## Information Hierarchy

From highest to lowest prominence:

1. Latest price in yuan per gram.
2. Change and percentage versus the first valid quote of the day.
3. Intraday trend.
4. Quote timestamp and five-minute collection interval.
5. Human-readable source label.

When a daily change cannot be calculated, the page explains why instead of displaying a neutral or fabricated value.

## Architecture

Keep Astro as the static page shell and add one client-rendered React island.

### Astro page shell

`apps/www/src/pages/index.astro` owns document structure, metadata, and the mount point. It does not fetch market data or know Liveline's API.

`apps/www/astro.config.mjs` registers the React integration while preserving the existing static output, GitHub Pages base path, and site URL.

### Dashboard island

`apps/www/src/components/PriceDashboard.tsx` owns:

- manifest and daily-file loading;
- the `loading`, `empty`, `sparse`, `ready`, `stale`, and `error` state model;
- latest-price and daily-change derivation;
- retry behavior;
- the visual information hierarchy around the chart.

### Chart adapter

`apps/www/src/components/PriceChart.tsx` is the only module that imports Liveline. It receives normalized valid observations and display formatters. The adapter configures:

- dark theme and gold accent;
- scrubbing enabled;
- subtle grid and area fill;
- momentum arrows, degen mode, value overlay, and window controls disabled;
- a reduced-motion configuration when requested by the operating system.

Keeping the dependency behind this adapter allows Liveline to be replaced without changing data loading or page-state logic.

### Data helpers

`apps/www/src/lib/prices.ts` remains framework-independent and gains pure helpers for:

- extracting valid timestamped observations;
- finding the first and latest valid observations;
- calculating absolute and percentage daily change;
- determining whether a file is empty, sparse, or chartable.

Remove the ECharts renderer and its resize binding after the React chart adapter replaces them.

## Data Flow

1. The React island fetches `public/data/manifest.json`.
2. It selects the only channel and that channel's `latestDate`.
3. It fetches the corresponding daily JSON file.
4. Pure helpers compare the file date with today's date in `Asia/Shanghai`, then convert non-null current-day cells into Unix-second Liveline points.
5. The dashboard derives latest price, first price, change, percentage, and quote timestamp.
6. Two or more valid current-day points are passed to `PriceChart`; fewer points use explicit empty or sparse presentation, and a file from an earlier Shanghai date uses the stale presentation.

The page loads once. It does not poll, interpolate new market values, or call the source WebSocket directly. Timestamps shown as “updated” always come from recorded quote data, not the browser clock.

Null slots are not filled or carried forward. The chart connects neighboring real observations, and scrub labels expose their exact timestamps.

Liveline anchors its viewport to the browser's current time and cannot render an arbitrary historical calendar day. Therefore, the first version only charts a file whose date equals today's date in `Asia/Shanghai`. It never rebases historical timestamps to the current date.

## Page States

### Loading

Reserve the final layout dimensions and show a restrained loading treatment. It must not look like a live price movement or cause layout shift.

### Empty

With no valid observations, show “今日暂无报价” and no line.

### Sparse

With one valid observation:

- show the latest price and its timestamp;
- state that today's change requires at least two quotes;
- show a single gold point with “正在积累今日走势”;
- do not draw or extend a line.

### Ready

With at least two valid observations:

- show latest price;
- show absolute and percentage change from the day's first valid observation;
- render Liveline with hover and touch scrubbing;
- color positive change green, negative change red, and unchanged change neutral.

### Stale

When the latest available file predates today in `Asia/Shanghai`:

- show its latest recorded price and full date/time;
- label the data as out of date;
- do not pass historical points to Liveline or draw a line;
- do not calculate or present the old file's change as today's change.

### Error

Preserve the page shell, show a concise loading error, and offer a retry action. Do not replace the entire page with raw network or stack-trace text.

## Responsive and Accessible Behavior

- Support 375 px, 768 px, and 1440 px viewports without horizontal scrolling or clipped prices.
- Use semantic text for all price information; the canvas is an enhancement, not the only representation.
- Provide an accessible chart label and a textual summary of latest price, change, and update time.
- Ensure retry and interactive elements have visible keyboard focus.
- Keep text and line contrast readable against the dark background.
- Respect `prefers-reduced-motion`; retain data and interactions while removing nonessential transitions.
- Scrubbing must work with both pointer hover and touch.

## Dependencies

Add React integration for Astro and use:

- `@astrojs/react`;
- `react` and `react-dom`;
- `liveline`.

Liveline is accepted despite its early `0.0.x` version because its Canvas renderer, built-in scrub interaction, responsive behavior, and visual character match the approved design. Its use must remain isolated in `PriceChart.tsx`.

Remove `echarts` after migration.

## Testing and Verification

Use the repository's existing `tsx --test` approach for pure helper tests. Cover:

- no valid quotes;
- one valid quote;
- multiple quotes;
- null slots between real observations;
- current versus stale Shanghai dates;
- positive, negative, zero, and unavailable daily changes;
- timestamp conversion and existing data URLs.

Verification also requires:

- `astro check`;
- a production build;
- confirmation that ECharts is absent from dependencies and generated bundles;
- manual checks at 375 px, 768 px, and 1440 px;
- manual checks for loading, sparse, ready, and error states;
- keyboard, touch scrub, and reduced-motion checks.

## Acceptance Criteria

- A visitor can identify the latest gold price, recorded update time, and—when calculable—today's change within three seconds.
- When today's change or trend is unavailable, the reason is equally clear within the same first view.
- The page contains no channel or date selector.
- A single observation never becomes a fabricated line.
- Historical timestamps are never rebased to make Liveline render them as current data.
- Ready-state chart scrubbing reports exact observation time and value.
- The page never implies a WebSocket or continuously updating feed.
- Mobile and desktop preserve the same information hierarchy.
- ECharts is fully removed and Liveline is contained behind the chart adapter.
