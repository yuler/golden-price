# Cloudflare Worker Custom Domain

Bind `api.gold.yuler.dev` to the Worker so the website talks to a stable API origin instead of `*.workers.dev`.

## Why

- Website (`gold.yuler.dev` / `gold.yuler.cc`) fetches JSON from the Worker
- Custom domain keeps the API URL short and independent of the Workers.dev hostname
- CORS allowlist matches the site origins; the data base URL is `https://api.gold.yuler.dev`

## Domains

| Role | Domain | Hosted by |
|------|--------|-----------|
| Website | `gold.yuler.dev`, `gold.yuler.cc` | GitHub Pages |
| Data API | `api.gold.yuler.dev` | Cloudflare Worker |
| Dev fallback | `golden-price.is-yuler.workers.dev` | Cloudflare (`workers_dev = true`) |

## Setup

Configured in `apps/worker/wrangler.toml`:

```toml
workers_dev = true

routes = [
  { pattern = "api.gold.yuler.dev", custom_domain = true }
]
```

`custom_domain = true` lets Cloudflare manage DNS for that hostname when the zone is on the same account. Deploy with:

```bash
pnpm worker:deploy
```

## App config

Point the static site at the custom API:

| Setting | Value |
|---------|--------|
| `PUBLIC_DATA_BASE_URL` | `https://api.gold.yuler.dev` |
| Worker CORS origins | `https://gold.yuler.dev`, `https://gold.yuler.cc`, local Astro |

Repo Actions variable / `.env` should use the custom domain, not `*.workers.dev`.
