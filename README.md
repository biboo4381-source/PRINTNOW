# PRINTNOW: Upload Website

Customer-facing website for PRINTNOW self-service printing kiosks. Customers upload **one document per order** (PDF, JPG or PNG), preview it (choose PDF pages, or crop/rotate/resize a photo on an A4 page), choose print settings, see the price, complete a **simulated (demo) QRIS payment**, and receive a **collection code** to print at a PRINTNOW kiosk. The server prepares a print-ready PDF that matches the customer's preview.

## Stack

- **Next.js 16** (App Router, TypeScript), Tailwind CSS 4, deployed on **Vercel**
- **Neon Postgres** + Drizzle ORM (embedded PGlite for local dev/tests)
- **Vercel Blob** (private store) for uploaded files
- Vitest (unit + integration) and Playwright (E2E on desktop and phones)

## Customer journey

`/` → `/print` (1 Upload) → `/print/adjust` (2 Adjust & Preview) → `/print/settings` (3 Settings + summary) → `/pay/[id]` (4 Demo QRIS) → `/order/[id]` (5 Collection code)

## Docs

| Document | For |
|---|---|
| [docs/ARCHITECTURE_PROPOSAL.md](docs/ARCHITECTURE_PROPOSAL.md) | Approved architecture (Phase 1) |
| [docs/KIOSK_API.md](docs/KIOSK_API.md) | Kiosk developer: API to look up, claim, download and complete orders |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel setup, env vars, changing prices, adding kiosks, local dev |
| [docs/TEST_REPORT.md](docs/TEST_REPORT.md) | Test results against the 16 required scenarios |

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. No database or storage setup is needed locally.

## Project layout

```
app/(site)/        customer pages (home, print flow, pay, order, help, privacy)
app/api/           customer API, kiosk API (/api/kiosk/*), cron, health
lib/               pricing, page ranges, codes, file checks, config,
                   image-layout (shared A4 preview/print maths), print-render (server PDF output)
lib/services/      orders, payments, kiosk, cleanup (all business rules)
lib/db/            Drizzle schema + connection        drizzle/  SQL migrations
tests/             unit, integration (PGlite), e2e (Playwright)
```
