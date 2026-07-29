# Golden Price

Collect gold prices from multiple channels and normalize to CNY/g.

## How it works

```mermaid
flowchart LR
  C[Channel] --> TS[TypeScript collector]
  TS --> N[Normalize to CNY/g]
  N --> D[data/channel/YYYY-MM-DD.json]
  D --> GA[GitHub Actions]
  GA -.-> S[Website]
```

JSON files are git-tracked. When the market is closed, slots are filled with the nearest previous price. Missed collection ticks on the same day are forward-filled on the next successful run.

## Channels

| ID              | Source                                                 | Quote field                                        | Unit    |
|-----------------|--------------------------------------------------------|----------------------------------------------------|---------|
| `jingjinjin.cn` | [jingjinjin.cn](https://jingjinjin.cn/) STOMP WebSocket | `originhuangjin.prices.originhuangjin.huigou`      | CNY/g   |

```bash
pnpm install
pnpm fetch
```

```json
{
  "channel": "jingjinjin.cn",
  "cnyPerGram": 877.9,
  "unit": "CNY/g",
  "trade": true
}
```

## Data format

`data/<channel>/YYYY-MM-DD.json` — 24 h × 6 slots (every 10 min), each cell is `number` or `null`.

Example: `data/jingjinjin.cn/2026-07-29.json`

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

`prices[h][i]` — hour `h` (0–23), slot `i` (0–5). Always 24 rows × 6 cells.

Scheduled collection runs on UTC cron (`*/10`); slot indexes always use Asia/Shanghai wall time.

## Stack

- **TypeScript** — collectors
- **GitHub Actions** — scheduled collection (~10 min)
- **JSON** — daily grids in git

## Roadmap

- [x] Channel SDK + `jingjinjin.cn` collector
- [x] Daily JSON persistence
- [x] Scheduled runs via GitHub Actions
- [x] Market-closed / missed-slot gap fill
- [ ] Subscriptions / alerts
- [ ] Website
