# Test Report

Date: 5 November 2026 · Build: Next.js 16.4.5 production build

## Summary

| Suite | Tool | Result |
|---|---|---|
| Unit (pricing, page ranges, codes, file detection, PDF checks) | Vitest | **28 / 28 passed** |
| Integration (orders, payment, kiosk flow, cleanup, auth on a real Postgres engine via PGlite) | Vitest | **28 / 28 passed** |
| End-to-end (real browser against the production build) | Playwright, 3 device profiles × 5 specs | **15 / 15 passed** |
| Type check / lint / production build | tsc, ESLint, `next build` | **Clean** (0 errors, 0 warnings) |

Run them yourself:

```bash
npm test
```

```bash
npm run build && npm run test:e2e
```

## Required scenarios (brief §10)

| # | Scenario | Covered by | Result |
|---|---|---|---|
| 1 | Upload a valid PDF | integration `1. accepts a valid PDF…`; E2E full journey (5-page PDF, page count shown) | ✅ Pass |
| 2 | Upload a valid JPG or PNG | integration `2. accepts PNG and JPG…`; E2E full journey (PNG) | ✅ Pass |
| 3 | Unsupported file | integration `3. rejects an unsupported file…` (also deleted from storage); E2E `.txt` rejected in browser, and a text file renamed `.pdf` rejected by the server | ✅ Pass |
| 4 | Oversized file | integration `4. rejects an oversized file`; E2E 21 MB file rejected with "maximum is 20.0 MB" | ✅ Pass |
| 5 | Black & white printing | integration `5–9`; E2E settings (B&W default, Rp 500/page) | ✅ Pass |
| 6 | Color printing | integration `5–9`; E2E switches PDF to Color (Rp 1.500/page) | ✅ Pass |
| 7 | Change number of copies | integration `5–9`; E2E "More copies" → total updates | ✅ Pass |
| 8 | Select specific pages | unit `parsePageSelection` (9 invalid cases + valid forms); E2E `1-2, 4` and invalid page `9` blocked | ✅ Pass |
| 9 | Total updates correctly | E2E checks total after every change: Rp 3.000 → 8.000 → 15.500 → 9.500; server recalculates (integration) | ✅ Pass |
| 10 | Complete simulated payment | integration `10–11`; E2E "SIMULATE SUCCESSFUL PAYMENT" | ✅ Pass |
| 11 | Unique collection code generated | unit (format, >99.5% unique over 2,000 draws); DB unique index on active codes; integration idempotent + concurrent payment produce one code and one payment row | ✅ Pass |
| 12 | Unpaid orders get no usable code | integration `12.` (no code stored, kiosk lookup fails); E2E opening/reloading the pay page does **not** pay; API returns `collectionCode: null` | ✅ Pass |
| 13 | Code retrieves the correct order | integration `13–14`; E2E kiosk lookup with the code from the confirmation page | ✅ Pass |
| 14 | Correct files and print settings | integration `13–14` (mode, copies, pages, counts, SHA-256 of downloaded file); E2E download returns the PDF bytes | ✅ Pass |
| 15 | Completed orders can't be printed again | integration `15.` + "two kiosks claiming at once: exactly one wins"; E2E lookup after completion → `409 ALREADY_COMPLETED`, customer page shows "Printed" | ✅ Pass |
| 16 | Mobile and desktop | E2E runs every spec on **Desktop 1280×800**, **Pixel 7** and a **360×640 small phone**, asserting no sideways scrolling on each page | ✅ Pass |

## Additional checks

- Only the browser that created an order can view or pay it (other browser → "Order not found", pay API → 404).
- Kiosk API rejects missing/wrong credentials (401) and rate-limits a kiosk after 5 wrong codes in 10 minutes (429), without affecting other kiosks.
- Password-protected and damaged PDFs are rejected with clear messages.
- Expired unpaid orders can't be paid; expired paid orders can't be collected.
- Retryable kiosk failure returns the order to PAID; fatal failure marks it FAILED.
- Cleanup job expires overdue orders and deletes their files and stale uploads.
- Price changes apply to new orders only; existing orders keep their price.

## Issues found and fixed during testing

| Issue | Fix |
|---|---|
| Header "Start printing" button made pages 13 px wider than a 360 px phone | Compact "Print" button on phones |
| Long file names without spaces stretched the payment page past the screen | Grid columns can now shrink (`grid-cols-1` on mobile); E2E now uses a long unbroken file name |
| Collection code wrapped onto two lines on phones | Smaller monospace size on phones, no wrapping |

## Not yet tested / known limitations

- **Production environment with Neon + Vercel Blob**: automated tests use embedded Postgres and local file storage. The production deployment needs the Neon database connected (see `docs/DEPLOYMENT.md`); a manual smoke test on the live URL is required after that.
- **Real devices**: phones were emulated in Chromium. A quick manual pass on a real iPhone (Safari) and Android phone is recommended before the demo.
- **Physical kiosk**: API behaviour is tested, but not yet with Jonathan's kiosk software or printer.
- **Very large PDFs** (hundreds of pages close to 20 MB) were not load-tested; verification runs inside a 30 s function limit.
