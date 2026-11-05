# Deployment & Operations

## Where it runs

| Piece | Service | Notes |
|---|---|---|
| Website + API | Vercel project **`printnow-web`** (team "bside2") | Linked to GitHub `biboo4381-source/PRINTNOW`. Every push to the production branch deploys automatically. Functions run in `sin1` (Singapore). |
| File storage | Vercel Blob store **`printnow-uploads`** (private, `sin1`) | Connected to the project; provides `BLOB_READ_WRITE_TOKEN`. |
| Database | **Neon Postgres** via Vercel Marketplace | Provides `DATABASE_URL`. Migrations run automatically during each build (`npm run build` → `npm run db:migrate`). |
| Daily cleanup | Vercel Cron → `/api/cron/cleanup` at 19:00 UTC (02:00 WIB) | Defined in `vercel.json`. |

Production branch: `claude/printnow-upload-website-e9stvn` (the repo's only branch at setup time). If you later create `main`, change it in **Vercel → printnow-web → Settings → Git**.

Deployment protection: production URLs are public; **preview** deployments require Vercel login.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Set by the Neon integration | Postgres connection string (pooled). |
| `BLOB_READ_WRITE_TOKEN` | Set by the Blob store connection | Private file storage. |
| `KIOSK_API_KEYS` | Project env (encrypted) | `kiosk-id:sha256(key)` pairs, comma-separated. |
| `CRON_SECRET` | Project env (sensitive) | Protects `/api/cron/cleanup`; Vercel Cron sends it automatically. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` / `NEXT_PUBLIC_SUPPORT_PHONE` | Optional | Contact details shown in the footer and help pages (placeholders until set). |

Never commit real values. `.env*` files are git-ignored.

## One-time setup: connect the Neon database

_Status: done on 5 Nov 2026 (Neon store connected to Production and Preview)._ Steps kept for reference / re-creating the project:

1. Open **Vercel → printnow-web → Storage → Create Database → Neon (Serverless Postgres)**.
2. Choose the free plan and region **Singapore (aws-ap-southeast-1)**, then **Connect** it to `printnow-web` for Production and Preview.
3. Redeploy (Deployments → ⋯ → Redeploy). The build runs the migrations and seeds the placeholder prices.
4. Check `https://<production-url>/api/health` → `{"status":"ok","database":"ok","databaseMode":"postgres","storage":"blob"}`.

## Common tasks

**Change prices** (no redeploy needed). In the Neon SQL editor:
```sql
INSERT INTO pricing_config (bw_price_per_page, color_price_per_page, note)
VALUES (600, 2000, 'Final pricing agreed by team');
```
The newest row is used for new orders; existing orders keep the price they were created with.

**Add a kiosk**
```bash
npm run kiosk:key -- kiosk-02
```
Give the printed key to the kiosk. Append the printed `kiosk-02:<hash>` to `KIOSK_API_KEYS` (comma-separated), then redeploy.

**Reset an order stuck in PROCESSING** (kiosk crashed mid-print, after checking nothing was printed):
```sql
UPDATE orders SET status = 'PAID', claimed_by_kiosk = NULL, processing_at = NULL
WHERE order_ref = 'PNO-......' AND status = 'PROCESSING';
```

**Look up an order** (support):
```sql
SELECT order_ref, status, collection_code, total_price, created_at, paid_at, completed_at
FROM orders WHERE order_ref = 'PNO-......';
```

## Local development

```bash
npm install
```

```bash
npm run dev
```

No setup is needed: without `DATABASE_URL` the app uses an embedded Postgres (PGlite) in `.data/`, and without `BLOB_READ_WRITE_TOKEN` uploads are stored in `.data/uploads`. Delete `.data/` to start fresh. For kiosk testing locally, put a `KIOSK_API_KEYS` entry in `.env.local`.

Checks:
```bash
npm run typecheck && npm run lint && npm test
```

```bash
npm run build && npm run test:e2e
```

## Free-tier limits to keep an eye on

Vercel Hobby (non-commercial use), Vercel Blob free allowance, and Neon free tier are enough for the prototype. Check usage in the Vercel and Neon dashboards before demo day. Neon scales to zero when idle, so the first request after a quiet period can take ~1 s longer. Open the site once before a live demo.
