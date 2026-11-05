# PRINTNOW Upload Website: Technical Architecture Proposal

**Phase 1: Technical audit and architecture**
Status: **Draft, waiting for approval (Grace)**. Kiosk integration needs review by Jonathan.
Date: 5 November 2026

> **Change in direction:** The original brief said to build on Wix. The team has since decided to build the site **in code, in this GitHub repository, and deploy it on Vercel**. This proposal follows that decision. Section 1 records what we found in Wix so the decision is documented.

---

## 0. Summary

| Item | Recommendation |
|---|---|
| Frontend + backend | **Next.js** (App Router, TypeScript): one codebase for the pages and the API |
| Hosting | **Vercel** (Hobby plan, connected to this GitHub repo; each push deploys automatically) |
| Database | **Neon Postgres** (serverless Postgres, added through the Vercel Marketplace) with **Drizzle ORM** |
| File storage | **Vercel Blob**. Files go straight from the browser to storage, never through our functions |
| Styling | Tailwind CSS with PRINTNOW brand tokens; fonts: Plus Jakarta Sans (headings) and Inter (body) |
| Payment | Dummy QRIS simulated on our server. **No payment gateway.** |
| Kiosk integration | REST JSON API under `/api/kiosk/*`, protected with a kiosk API key |
| Expected cost | **Rp 0 / $0** on free tiers for the prototype (see §15) |

The customer journey stays exactly as in the brief:
**Upload → Configure → Price → Simulated QRIS payment → Collection code → Kiosk.**

---

## 1. Current environment assessment

### 1.1 Wix (audited, not used going forward)
- The connected Wix account has **5 sites: "Scented Lounge" (×2) and "Keripik Goyang" (×3)**. **None of them is a PRINTNOW site.**
- All 5 are on the free plan, "Editorless" (created through the API), with Velo enabled and unrelated apps (Wix Hotels, Invoices, SEO).
- **Nothing exists to migrate.** We will leave these sites untouched.

### 1.2 GitHub
- Repository `biboo4381-source/printnow` is **empty**: no commits before this proposal.
- Development branch: `claude/printnow-upload-website-e9stvn`.

### 1.3 Vercel
- Account on the **Hobby (free) plan**, with GitHub as the Git provider.
- The default team scope ("bside2") **has not yet authorized this connection**, so projects and installed integrations could not be listed. **Action needed:** the account owner approves team access (link given in chat). After that I can create the project and connect storage.
- **Hobby plan terms:** Hobby is intended for personal, non-commercial use. An academic prototype fits this. A real commercial launch would need the Pro plan (see §15).

### 1.4 Why Next.js on Vercel is a good fit (vs. Wix)
| Need | Wix/Velo | Next.js on Vercel |
|---|---|---|
| Server-side payment and code logic | Possible (Velo backend) | Native (API routes / server actions) |
| Stable, documented API for the kiosk | Possible (`http-functions`), but tied to the Wix site | Native REST routes we fully control |
| Private file storage with controlled kiosk access | Limited control over Media Manager | Vercel Blob + server-side proxy |
| Version control, code review, automated tests | Weak | Git, PR previews, Vitest/Playwright |
| Design freedom | Editor-constrained | Full control |

---

## 2. Recommended sitemap

```
/                         Home: hero, START PRINTING, 3 steps, formats, FAQ preview, footer
/print                    Step 1: Upload documents
/print/settings           Step 2: Print settings per file + live price
/print/review             Step 3: Order summary → "Continue to payment" (creates the order)
/pay/[orderId]            Step 4: Dummy QRIS payment (DEMO banner)
/order/[orderId]          Step 5: Confirmation: collection code, summary, kiosk instructions
/help                     How it works + FAQ
/privacy                  Short note on how files are stored and deleted

/api/uploads/token        Issues one-time upload tokens (Vercel Blob client upload)
/api/files/verify         Verifies an uploaded file on the server (type, size, page count)
/api/orders               Creates an order (server recalculates the price)
/api/orders/[id]          Reads an order (needs the customer's order access token)
/api/orders/[id]/pay      Simulates payment → PAID + collection code
/api/pricing              Public current prices (for display)
/api/kiosk/*              Kiosk integration API (see §12)
/api/cron/cleanup         Scheduled cleanup of expired orders and files
```

There is **no login** for customers. Access to an order is protected by a secret per-order token (see §13).

---

## 3. Complete customer journey

```
 Customer phone / computer                     PRINTNOW backend (Vercel)              Kiosk (Jonathan)
 ─────────────────────────                     ─────────────────────────              ────────────────
 1  Opens site (direct or kiosk QR → "/")
 2  Taps START PRINTING → /print
 3  Picks/drops files ──── token request ───▶  /api/uploads/token (type/size limits)
                     ──── direct upload ────▶  Vercel Blob (private path)
                     ──── verify ───────────▶  /api/files/verify → checks magic bytes,
                                               counts PDF pages, saves UploadedFiles row
 4  Sets mode/copies/pages per file; live price (preview only)
 5  Review → "Continue to payment" ─────────▶  /api/orders → re-validates everything,
                                               recalculates price → status PENDING_PAYMENT
 6  /pay/[id]: sees summary + demo QRIS
 7  Taps SIMULATE SUCCESSFUL PAYMENT ───────▶  /api/orders/[id]/pay (one transaction):
                                               Payment row → generate unique code → PAID
 8  /order/[id]: collection code PN•••••• + instructions
 9                                                                                     Customer enters code
10                                             /api/kiosk/lookup ◀──────────────────── verify code
11                                             /api/kiosk/orders/[id]/claim ◀───────── PAID → PROCESSING
12                                             file download (streamed) ◀───────────── kiosk prints
13                                             /api/kiosk/orders/[id]/complete ◀────── PROCESSING → COMPLETED
```

---

## 4. Page-by-page functionality

### A. Home (`/`)
- Header: logo, "How it works", "Help", and a **START PRINTING** button that stays visible on mobile.
- Hero: "Print anywhere. Upload now, collect at a PRINTNOW kiosk." Main CTA above the fold.
- 3 steps with icons: Upload → Configure & pay → Collect at kiosk.
- Supported formats: PDF, JPG, PNG; max size per file; A4.
- FAQ preview (4–5 questions) linking to `/help`.
- Footer: contact email/phone (team to supply), Help, Privacy, "Academic prototype" note.

### B. Upload (`/print`)
- Drag-and-drop zone + large "Browse files" button. On phones, this opens the camera roll or file picker.
- **Accepted:** PDF, JPG/JPEG, PNG. **Proposed limits:** 20 MB per file, max 5 files per order (both configurable).
- Per-file card: thumbnail (first page for PDF, image preview for JPG/PNG), name, type, size, **page count**, progress bar, Remove and Replace buttons.
- Validation in two layers:
  1. In the browser (instant feedback): extension, MIME type, size.
  2. **On the server (authoritative):** file signature/magic bytes, real size, PDF readable and not password-protected, page count.
- Clear errors, for example: "This file type isn't supported. Please upload a PDF, JPG or PNG." / "This file is larger than 20 MB." / "This PDF is password-protected and can't be printed."
- "Continue" stays disabled until every file has passed server verification.
- Original files are stored unchanged. Images are not re-compressed.

### C. Print settings (`/print/settings`)
Shown per file (an accordion on mobile, cards on desktop):
- **Paper size:** A4 (shown, fixed for now).
- **Mode:** Black & White / Color (large toggle buttons).
- **Copies:** stepper (−/+), 1–50 (configurable).
- **Pages:** All pages / Custom range (`1-3, 5, 8-10`), validated against the page count. Images are always 1 page.
- **Summary per file:** pages selected × copies = printed pages; price per page; subtotal.
- A sticky bottom bar on mobile shows the **order total**, which updates on every change.

### D. Review (`/print/review`)
- All files with their settings, subtotals, and the order total.
- "Edit" links back to settings.
- **Continue to payment** creates the order on the server. The server recalculates the price and **ignores any price the browser sends**.

### E. Payment (`/pay/[orderId]`)
- Persistent banner: **"DEMO PAYMENT — NOT A REAL TRANSACTION"**.
- Order summary and total in Rupiah.
- An **illustrative** QR image. It encodes only a harmless demo string such as `PRINTNOW-DEMO:<order ref>`, is watermarked "DEMO", and is **not a real QRIS payload**. We will not use official QRIS or Bank Indonesia logos, so it can't be mistaken for a real payment request.
- Button **SIMULATE SUCCESSFUL PAYMENT** → server call. Opening the page **never** changes the payment status.
- "Cancel order" link (the order expires anyway after the timeout; see §6).

### F. Confirmation (`/order/[orderId]`)
- Success state, the **collection code in large monospace type** (for example `PN 482 917`), a **Copy** button, and a "Save as image / screenshot" hint.
- Order reference (for example `PNO-261105-7KQ2`), date, total, and files with their settings.
- Kiosk steps: 1) Visit a PRINTNOW kiosk → 2) Tap **COLLECTION CODE** → 3) Enter code → 4) Confirm → 5) Collect prints.
- Code validity (for example "valid for 7 days").
- The page can be reopened later from the same browser (the token is kept in local storage). Other people can't open it without the token.

### G. Help / FAQ (`/help`)
Short answers to: how to upload; supported formats and limits; how to configure printing; how the demo payment works; how to use the collection code; what to do if the code doesn't work (check typing, check expiry, contact support with the order reference).

---

## 5. UI/UX direction

- **Tokens:** primary `#0877F9`, navy `#0C2C55` (text, headers), background `#F2F6FA`, green `#159447` (success and the recycling message), white cards, 16–20 px radius, soft shadows.
- **Type:** Plus Jakarta Sans for headings, Inter for body/UI. Base size 16–18 px, so it's readable for older users.
- **Mobile-first:** single column, sticky primary action at the bottom, tap targets ≥ 48 px, step indicator (1 Upload · 2 Settings · 3 Pay · 4 Collect).
- **Accessibility:** WCAG AA contrast (navy on light background, white on primary blue), visible focus states, labels on all inputs, errors announced to screen readers, no information carried by color alone.
- **Tone:** friendly and brief. Icons (Lucide) next to every key action. No stock "corporate" imagery. Use simple illustrations of a phone → kiosk → paper.
- **Components** (built once, reused): Button, Card, Stepper, FileCard, SegmentedToggle, QuantityStepper, PriceBar, CodeDisplay, Alert, Banner.
- **Phase 2 deliverable:** clickable mobile + desktop mockups for Home, Upload, Settings, Payment and Confirmation, for review before full build.

---

## 6. Recommended architecture

```
                ┌────────────────────────── Vercel ──────────────────────────┐
 Browser ──────▶│ Next.js pages (React)                                      │
   │            │ Next.js API routes (Node.js functions)                     │
   │            │   ├─ customer API  (/api/orders, /api/files, …)            │
   │            │   ├─ kiosk API     (/api/kiosk/*, API-key auth)            │
   │            │   └─ cron          (/api/cron/cleanup, daily)              │
   │            └──────────────┬──────────────────────────┬──────────────────┘
   │  direct upload (token)    │ SQL (Drizzle)            │ read/delete blobs
   └──────────────────────────▶│                          ▼
                       Vercel Blob ◀──────────────  Neon Postgres
```

| Component | What it does | Why | Available? | Limits / dependencies |
|---|---|---|---|---|
| Next.js | Pages + server API in one repo | One language and one deploy; simple for a student team | Yes (open source) | — |
| Vercel Hobby | Hosting, HTTPS, preview deploy per PR | Already have the account; zero config with GitHub | Yes (team access approval pending) | Non-commercial use; function time and size limits; **request body ≤ 4.5 MB**, so uploads must go direct to Blob |
| Neon Postgres | Orders, files, settings, payments, logs | Relational data with real transactions, needed for "pay once" and "claim once" | Via Vercel Marketplace (free tier) | Free-tier storage/compute caps; scales to zero (first query after idle is slightly slower) |
| Drizzle ORM | Typed schema + migrations | Lightweight, works well with serverless Postgres | Yes (open source) | — |
| Vercel Blob | Stores uploaded documents | Integrated with Vercel; supports **direct client uploads with signed tokens** | Vercel product (free allowance on Hobby) | See §8 on URL privacy |

**Alternative considered: Supabase** (Postgres + private storage buckets + signed URLs in one service). This is a strong option, but free-tier projects are **paused after a period of inactivity** and must be restored by hand. That is a real risk for a demo day. We recommend Neon + Blob and keep Supabase as a fallback.

---

## 7. Database structure

The brief's five collections are kept, plus one small `pricing_config` table (needed for "prices editable without redeploy"). All IDs are UUIDs. Money is stored as **integer Rupiah**.

### `orders`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | internal |
| order_ref | text unique | human-friendly, e.g. `PNO-261105-7KQ2` |
| collection_code | text, nullable | set **only** when paid; unique among active orders |
| status | enum | `PENDING_PAYMENT`, `PAID`, `PROCESSING`, `COMPLETED`, `FAILED`, `EXPIRED`, `CANCELLED` |
| payment_status | enum | `UNPAID`, `PAID` |
| total_price | integer | recalculated on the server |
| access_token_hash | text | SHA-256 of the customer's secret order token |
| created_at, paid_at, processing_at, completed_at | timestamptz | |
| expires_at | timestamptz | unpaid: +24 h; paid: +7 days (proposed) |
| claimed_by_kiosk | text, nullable | which kiosk is printing it |
| failure_reason | text, nullable | |

### `uploaded_files`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK, nullable | null until the order is created; orphans are cleaned up after 24 h |
| original_name | text | sanitized for display |
| format | enum | `PDF`, `JPG`, `PNG` |
| mime_type, size_bytes | text, integer | verified on the server |
| storage_key | text | Blob pathname. **Never sent to the customer's browser** |
| page_count | integer | counted on the server (images = 1) |
| sha256 | text | integrity check for the kiosk |
| uploaded_at | timestamptz | |

### `print_settings` (one row per file)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| order_id, file_id | uuid FK | |
| paper_size | enum | `A4` |
| color_mode | enum | `BW`, `COLOR` |
| copies | integer | 1–50 |
| page_selection | text | normalized, e.g. `1-3,5` or `all` |
| selected_page_count | integer | |
| price_per_page | integer | **snapshot** at order time |
| printed_pages | integer | selected_page_count × copies |
| subtotal | integer | printed_pages × price_per_page |

### `payments`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK unique | one successful payment per order |
| payment_type | text | `DUMMY_QRIS` |
| amount | integer | must equal `orders.total_price` |
| simulation_status | enum | `SIMULATED_SUCCESS` (room for `SIMULATED_FAILED`) |
| paid_at | timestamptz | |

### `kiosk_logs`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| kiosk_id | text | from the kiosk's credentials |
| order_id | uuid FK, nullable | null when the code was not found |
| action | enum | `LOOKUP`, `CLAIM`, `DOWNLOAD`, `COMPLETE`, `FAIL` |
| code_attempted | text | masked in admin views |
| result | text | e.g. `OK`, `INVALID_CODE`, `NOT_PAID`, `ALREADY_COMPLETED`, `EXPIRED` |
| error_detail | text, nullable | |
| created_at | timestamptz | |

### `pricing_config`
| Field | Type | Notes |
|---|---|---|
| id | serial PK | |
| bw_price_per_page | integer | placeholder **Rp 500** |
| color_price_per_page | integer | placeholder **Rp 1.500** |
| currency | text | `IDR` |
| active_from | timestamptz | newest active row wins; old rows kept as history |

**Why this structure:** It matches the brief one-to-one. It adds `pricing_config` (central, editable prices) and `access_token_hash` (customers can only see their own orders), and it stores price snapshots so changing prices later never changes past orders.

---

## 8. File upload and storage

1. The browser asks `/api/uploads/token` for a one-time upload token. The server limits **content types** (PDF/JPEG/PNG) and **maximum size** (20 MB) and gives the file a **random, unguessable path** (`uploads/<random-uuid>/<random>.pdf`).
2. The browser uploads **directly to Vercel Blob**, with a progress bar. This avoids the 4.5 MB function body limit.
3. The browser calls `/api/files/verify`. The server downloads the blob, checks magic bytes (`%PDF-`, `FF D8 FF`, `89 50 4E 47`), rejects encrypted/corrupt PDFs, counts pages with `pdf-lib`, computes SHA-256, and inserts the `uploaded_files` row. If verification fails, the blob is deleted.
4. A **PDF preview** uses `pdf.js` in the browser (first-page thumbnail) on the customer's local copy, so no storage URL is needed.

**Privacy of stored files:**
- We plan to use **private** Blob storage if the account supports it. If only public-access Blob is available, files sit at long random URLs that are **never sent to the customer's browser or the kiosk**. The kiosk downloads files **through our API** (`/api/kiosk/.../files/[fileId]`), which checks the kiosk key and order state and streams the bytes. To verify during setup: which Blob access modes our account has.
- **Retention:** files are deleted after the order is COMPLETED (after a short grace period, e.g. 24 h), when an unpaid order expires (24 h), or when an uncollected paid order expires (7 days). A daily Vercel Cron job runs the cleanup.

---

## 9. Printing configuration and pricing

- **Single source of truth:** a shared TypeScript module `lib/pricing.ts` (pure functions, unit-tested) is used by the browser for live preview **and** by the server for the authoritative total.
- Prices come from `pricing_config` in the database. Changing prices means updating one row (in the Neon console now, or an admin page later). No redeploy is needed.
- Formula per file:
  `subtotal = selected_pages × copies × price_per_page(color_mode)`
  `order_total = Σ subtotal`
- **Page range parser:** accepts `1-3, 5, 8-10`. It rejects pages outside `1..page_count`, reversed ranges, and empty input. Duplicates are merged. The result is stored normalized.
- **Assumptions to confirm:** single-sided printing only; one A4 sheet per page; images are scaled to fit A4; no minimum charge. Placeholder prices are Rp 500 (B&W) and Rp 1.500 (color) per page, to be replaced when the team finalizes pricing.

---

## 10. Dummy QRIS payment flow

```
PENDING_PAYMENT ──[SIMULATE SUCCESSFUL PAYMENT]──▶ PAID (+ collection code)
       │
       └──[24 h without payment]──▶ EXPIRED
```
`POST /api/orders/[id]/pay` (requires the customer's order token) runs as **one database transaction**:
1. Lock the order row; require `status = PENDING_PAYMENT` and not expired.
2. Insert a `payments` row (`DUMMY_QRIS`, amount = server total, `SIMULATED_SUCCESS`).
3. Generate a unique collection code (§11).
4. Set `status = PAID`, `payment_status = PAID`, `paid_at`, `expires_at = now + 7 days`.

The call is **idempotent**: pressing the button twice (or a network retry) returns the same code and never creates a second payment. Opening `/pay/...` only reads data.

---

## 11. Collection code generation and verification

- **Format (proposal):** `PN` + **6 digits**, e.g. `PN482917`. Digits only, so the kiosk needs just a numeric keypad. **To confirm with Jonathan.** If the kiosk has a full keyboard, we can use 6 characters from an unambiguous alphabet (no 0/O/1/I), which is much harder to guess.
- **Generation:** cryptographically secure random (`crypto.randomInt`), not sequential and not derived from time or order ID. Uniqueness is enforced by a **unique index on active codes**; on a collision we regenerate.
- **Only issued after simulated payment.** Unpaid orders have no code, so there is nothing to type at the kiosk.
- **Guessing protection:**
  - The lookup endpoint is only reachable with a **kiosk API key**, so nobody on the internet can probe codes.
  - Per-kiosk rate limiting: e.g. after 5 wrong codes in 10 minutes, a 2-minute cooldown (counted from `kiosk_logs`).
  - Codes expire and are freed for reuse after the order is completed or expired.
- **Verification states returned to the kiosk:** `OK` (PAID) · `INVALID_CODE` · `EXPIRED` · `ALREADY_PROCESSING` · `ALREADY_COMPLETED` · `FAILED`.

---

## 12. Website-to-kiosk integration

**Method:** HTTPS REST + JSON on the same Vercel deployment.
**Auth:** `Authorization: Bearer <KIOSK_API_KEY>` and `X-Kiosk-Id: <kiosk-name>`. Each kiosk gets its own key, stored as a Vercel environment variable (hashed list) and on the kiosk device. Keys never appear in website code.

| # | Endpoint | Purpose | Changes state? |
|---|---|---|---|
| 1 | `POST /api/kiosk/lookup` `{code}` | Verify the code; return the order summary for the "Confirm your order" screen | No (logs only) |
| 2 | `POST /api/kiosk/orders/{id}/claim` `{code}` | **Atomically** `PAID → PROCESSING` (fails if not PAID); returns files + settings | Yes |
| 3 | `GET /api/kiosk/orders/{id}/files/{fileId}` | Streams the original file (only while the order is PROCESSING and claimed by this kiosk) | No |
| 4 | `POST /api/kiosk/orders/{id}/complete` | `PROCESSING → COMPLETED` | Yes |
| 5 | `POST /api/kiosk/orders/{id}/fail` `{reason, retryable}` | Retryable (paper jam, kiosk error) → back to `PAID` so the customer can try again; otherwise → `FAILED` | Yes |

**Example: claim response**
```json
{
  "orderId": "8a3f…",
  "orderRef": "PNO-261105-7KQ2",
  "status": "PROCESSING",
  "files": [
    {
      "fileId": "c19e…",
      "name": "Thesis_Final.pdf",
      "format": "PDF",
      "pageCount": 42,
      "sha256": "…",
      "downloadPath": "/api/kiosk/orders/8a3f…/files/c19e…",
      "settings": {
        "paperSize": "A4",
        "colorMode": "BW",
        "copies": 2,
        "pages": "1-10,15",
        "selectedPageCount": 11,
        "printedPages": 22
      }
    }
  ]
}
```
**Error shape:** `{ "error": { "code": "ALREADY_COMPLETED", "message": "This order has already been printed." } }` with HTTP 401/404/409/410/429 as appropriate.

**Duplicate-printing prevention:** the claim step is a single conditional SQL update (`… WHERE status = 'PAID'`), so two kiosks (or a double tap) can't both claim the same order. COMPLETED orders can never be claimed again. If an order stays in PROCESSING too long (e.g. 15 min, kiosk crashed), it is **not** automatically reprinted. It is flagged for staff to reset, because an automatic reset could print twice.

**Optional (for Jonathan to decide):** instead of applying page selection on the kiosk, the server could produce one **print-ready PDF per file** with only the selected pages, and images placed on A4. That makes the kiosk simpler but adds server work.

**Deliverables for Jonathan (Phase 5):** an OpenAPI spec, a Postman/`curl` collection, a test kiosk key, a set of seeded test orders in every status, and a staging URL (Vercel preview).

**Questions for Jonathan before we finalize:**
1. Kiosk tech stack (Windows/Linux/Android? language?). Can it make HTTPS requests and print PDF/JPG/PNG directly?
2. Numeric keypad only, or full keyboard? (Decides the code format.)
3. Does the kiosk have reliable internet? Do we need offline behavior?
4. Should page selection and copies be applied by the kiosk's print driver, or should the server send print-ready PDFs?
5. How many kiosks for the demo, and what names/IDs?

---

## 13. Security and error handling

| Risk | Measure |
|---|---|
| Malicious/unsupported files | Type and size limits in the upload token; magic-byte check on the server; reject encrypted PDFs; never execute or render uploads on the server beyond page counting |
| Private file exposure | Random storage paths; storage URLs never sent to browsers; kiosk downloads via authenticated proxy; automatic deletion |
| Viewing someone else's order | Each order has a 128-bit random **access token** (stored hashed) that only the creating browser holds; order IDs alone are not enough |
| Price tampering | Server recalculates all prices from DB pricing; client totals are ignored |
| Fake "paid" status | Only the `/pay` endpoint can set PAID, inside a transaction; the page load never does |
| Code guessing | Kiosk-only lookup + API key + rate limiting + expiry |
| Double printing | Atomic claim; COMPLETED is final; idempotent endpoints |
| Secrets in frontend | DB URL, Blob token and kiosk keys only in Vercel server env vars; never prefixed `NEXT_PUBLIC_` |
| Interrupted upload/payment | Upload retry per file; progress saved in session storage; pay endpoint is idempotent; unpaid orders expire cleanly |
| Abuse/spam | Max files and size per order; basic per-IP rate limits on token/order endpoints; Vercel Firewall rules if needed |

Errors are shown in plain language with a next step ("Try again", "Choose another file", "Contact support with reference PNO-…"). The server logs technical detail; the customer never sees stack traces.

---

## 14. Feasibility classification, limitations and risks

| Category | Items |
|---|---|
| **Works with the chosen stack out of the box** | Pages, responsive UI, upload to Blob, PDF page counting, pricing, dummy payment, code generation, order statuses, kiosk REST API, cron cleanup, preview deployments |
| **Needs custom development (planned in this project)** | Page-range parser, server-side file verification, idempotent pay/claim logic, kiosk auth + rate limiting, cleanup job, demo QR image, tests |
| **Third-party services** | Vercel (hosting + Blob), Neon (Postgres) via Vercel Marketplace. Both free tier. No payment gateway. |
| **Not feasible / out of scope** | Real QRIS/bank payments (deliberately excluded); DOCX/PPTX printing (would need a document converter service, so formats stay PDF/JPG/PNG); printing password-protected PDFs; guaranteed byte-perfect print reproduction (depends on the kiosk printer driver) |

**Risks:**
- **Vercel team access** is not yet authorized for this connection (blocks project setup until approved).
- **Free-tier limits** (Blob storage/transfer, Neon compute). These are fine for a prototype; we'll monitor usage in the dashboards.
- **Neon cold start**: the first request after idle can take noticeably longer. Before a live demo, open the site once to warm it up.
- **Blob access mode** (private vs. public-unguessable) to confirm during setup (§8).
- **Kiosk unknowns** (§12 questions) could change the code format or file delivery.
- **Hobby plan** is for non-commercial use. A real deployment at a mall/airport would require Vercel Pro.

---

## 15. Estimated additional costs

| Item | Prototype | If launched for real (indicative) |
|---|---|---|
| Vercel hosting | **Free** (Hobby) | Pro plan per team member per month |
| Neon Postgres | **Free** tier | Paid plan by usage |
| Vercel Blob | **Free** allowance on Hobby | Usage-based |
| Custom domain (optional, e.g. `printnow.id`) | ~Rp 150k–400k / year if wanted; otherwise use `*.vercel.app` (free) | Same |
| Payment gateway | **Not needed** (dummy QRIS) | Midtrans/Xendit per-transaction fees |

**Expected prototype cost: Rp 0.** No paid service will be enabled without the team's approval. Exact free-tier allowances will be checked in the Vercel and Neon dashboards during setup.

---

## 16. Development timeline and milestones

| Phase | Work | Output | Est. |
|---|---|---|---|
| 1 | Audit + this proposal | **Approval from Grace; kiosk questions answered by Jonathan** | — (now) |
| 2 | UI/UX | Design tokens, components, mockups of 5 key screens (mobile + desktop) for review | 3–4 days |
| 3 | Website pages | Home, Upload, Settings, Review, Pay, Confirmation, Help, working with mock data | 4–5 days |
| 4 | Backend | Neon schema + migrations, Blob uploads + verification, pricing, orders, pay, codes, cleanup cron | 5–6 days |
| 5 | Kiosk integration | `/api/kiosk/*`, API keys, rate limit, OpenAPI doc, test keys + seeded orders, joint test with Jonathan | 3–4 days |
| 6 | Testing + finalization | Unit tests (pricing, ranges, codes), API tests (state machine), Playwright E2E on mobile + desktop viewports, all 16 scenarios from the brief, test report | 3–4 days |

**Total ≈ 3–4 weeks** of part-time student-project pace. Each phase ends with a review on a Vercel preview URL before moving on.

**Testing plan** (maps to brief §10): automated tests cover scenarios 1–15. Scenario 16 (mobile/desktop) is covered by Playwright device emulation plus a manual check on real phones. Failed tests and open issues will be logged in `docs/TEST_REPORT.md`.

---

## 17. Decisions needed

1. **Approve the stack:** Next.js + Vercel + Neon Postgres + Vercel Blob (instead of Wix).
2. **Approve Vercel team access** for the connection (link in chat), so the project can be created.
3. **Collection code format:** `PN` + 6 digits (default) vs. alphanumeric. Depends on the kiosk keypad.
4. **Limits:** 20 MB/file, 5 files/order, 1–50 copies. OK?
5. **Expiry:** unpaid orders 24 h, paid uncollected orders 7 days. OK?
6. **Placeholder prices:** Rp 500 B&W / Rp 1.500 color per page until the final pricing.
7. **Contact details** for the footer and the support text.
8. **Jonathan's answers** to the 5 kiosk questions in §12.
