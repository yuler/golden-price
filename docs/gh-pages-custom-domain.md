# GitHub Pages Custom Domain

Set a custom domain for a GitHub Pages site and verify it works.

## 1. Set custom domain via GitHub API

```bash
gh api -X PUT /repos/<owner>/<repo>/pages -f cname=<domain>
```

Example:

```bash
gh api -X PUT /repos/yuler/golden-price/pages -f cname=gold.yuler.dev
```

This creates a `CNAME` file in the repo root and tells GitHub to serve the site
on that domain.

## 2. Update DNS

Add a DNS record at your domain provider.

For a **subdomain** (e.g. `gold.yuler.dev`):

| Type  | Name   | Target               |
|-------|--------|----------------------|
| CNAME | `gold` | `yuler.github.io.`   |

For a **root domain** (e.g. `example.com`), use A records instead:

| Type | Name | Target             |
|------|------|--------------------|
| A    | `@`  | `185.199.108.153`  |
| A    | `@`  | `185.199.109.153`  |
| A    | `@`  | `185.199.110.153`  |
| A    | `@`  | `185.199.111.153`  |

## 3. Update Astro `site` config

If using Astro, update `astro.config.mjs`:

```js
site: "https://gold.yuler.dev",
```

## 4. Verify

### DNS propagation

```bash
dig gold.yuler.dev CNAME +short
```

Expected output: `yuler.github.io.`

```bash
dig gold.yuler.dev +noall +answer
```

### GitHub Pages API

```bash
gh api /repos/yuler/golden-price/pages | jq '.cname'
```

Expected: `"gold.yuler.dev"`

### HTTPS certificate status

```bash
gh api /repos/yuler/golden-price/pages | jq '.https_enforced'
```

`false` means cert is still provisioning. Check back after DNS propagates.

### Site access

```bash
curl -sI https://gold.yuler.dev | head -1
```

Expected: `HTTP/2 200`
