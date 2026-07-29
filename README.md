# Golden Price

Collect gold prices from multiple channels, store them as daily JSON grids, and visualize them on a static website.

## Monorepo layout

```text
apps/
  collector/          # CLI entry for scheduled and local collection
  www/                # Astro static site with intraday charts
packages/
  collector-core/     # Channels, storage, and collection logic
data/                 # Git-tracked daily price files
```

```mermaid
flowchart LR
  Source[Price source] --> Collector[apps/collector]
  Collector --> Core[packages/collector-core]
  Core --> Data[data/]
  Data --> Www[apps/www]
  Www --> Pages[GitHub Pages]
```

## Data format

`data/<channel>/YYYY-MM-DD.json` — 24 h × 6 slots (every 10 min), each cell is `number` or `null`.

```json
{
  "date": "2026-07-29",
  "unit": "CNY/g",
  "prices": [
    [null, null, null, null, null, null],
    [601.2, 601.3, 601.1, 601.4, 601.5, 601.2]
  ]
}
```

`prices[h][i]` — hour `h` (0–23), slot `i` (0–5). Slot indexes use Asia/Shanghai wall time.

## Channels

| ID              | Source                                                 | Quote field                                   | Unit  |
|-----------------|--------------------------------------------------------|-----------------------------------------------|-------|
| `jingjinjin.cn` | [jingjinjin.cn](https://jingjinjin.cn/) STOMP WebSocket | `originhuangjin.prices.originhuangjin.huigou` | CNY/g |

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm fetch      # one-off live quote
pnpm collect    # write current slot to data/
pnpm dev:www    # local website with copied data/
pnpm build:www  # production static build
```

## Website

The Astro app in `apps/www` copies `data/` into `public/data/` at build time and serves:

- a channel selector (first version defaults to `jingjinjin.cn`)
- a date picker
- latest price for the selected day
- an intraday line chart (ECharts)

GitHub Actions deploys the site to GitHub Pages at `/golden-price/` when `main` changes or after a successful collect run.

## Stack

- **pnpm workspace** — monorepo
- **TypeScript** — collectors and shared library
- **Astro** — static site
- **ECharts** — intraday charts
- **GitHub Actions** — scheduled collection and Pages deploy
