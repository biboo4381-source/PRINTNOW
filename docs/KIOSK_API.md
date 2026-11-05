# PRINTNOW Kiosk Integration API

For: **Jonathan (kiosk developer)**
Base URL: `https://printnow-web.vercel.app`
Format: HTTPS + JSON. All times are ISO-8601 UTC. Money is integer Rupiah.

> **Revision 2 (Nov 2026):** each order now contains **exactly one document**, and the server prepares a
> **print-ready PDF** for you. For photos it already includes the customer's crop/rotate/zoom on an A4 page.
> For PDFs with selected pages it contains only those pages. **Always print the `print` file.**

## 1. Authentication

Every request must include:

```
Authorization: Bearer <KIOSK_API_KEY>
X-Kiosk-Id: <kiosk-id>
```

- Each kiosk has its **own** ID and key. Keys are created with `npm run kiosk:key -- kiosk-01` (prints the key for the kiosk and a hash entry for the server).
- The server only stores a SHA-256 hash of the key (env var `KIOSK_API_KEYS`).
- Never put the key in a web page or public repository. If a key leaks, generate a new one and replace the server entry.
- Wrong or missing credentials → `401 UNAUTHORIZED`.

## 2. The flow

```
Customer types code
        │
        ▼
POST /api/kiosk/lookup {code}              → show "Is this your order?" screen   (no state change)
        │ customer taps Confirm
        ▼
POST /api/kiosk/orders/{id}/claim {code}   → PAID → PROCESSING (only one kiosk can win)
        │
        ▼
GET  files[0].downloadPath                  → the print-ready PDF (follow redirects!)
        │  print it: pages = files[0].print.pages, copies = settings.copies, mode = settings.colorMode
        ├── success → POST /api/kiosk/orders/{id}/complete            → COMPLETED (final)
        └── problem → POST /api/kiosk/orders/{id}/fail {reason, retryable}
                         retryable=true  → back to PAID (customer can try again)
                         retryable=false → FAILED
```

Order statuses: `PENDING_PAYMENT`, `PAID`, `PROCESSING`, `COMPLETED`, `FAILED`, `EXPIRED`, `CANCELLED`.
Only **PAID** orders can be claimed. Unpaid orders never have a code.

## 3. Collection code format

`PN` + 6 digits, e.g. `PN482917`. Displayed to customers as `PN 482 917`.
The server is forgiving: `pn 482 917`, `PN-482917` and `482917` are all accepted. A numeric keypad is enough. The kiosk can show "PN" as a fixed prefix and only ask for the 6 digits.

## 4. Endpoints

### 4.1 `POST /api/kiosk/lookup`

Verify a code and get the order summary. **Does not change the order.**

Request: `{ "code": "PN482917" }`

Response `200` (photo example):
```json
{
  "order": {
    "orderId": "8a3f2c4e-1b7d-4f0a-9c55-0d6b2e1f7a90",
    "orderRef": "PNO-261105-7KQ2",
    "status": "PAID",
    "totalPrice": 3000,
    "paidAt": "2026-11-05T09:12:44.000Z",
    "expiresAt": "2026-11-12T09:12:44.000Z",
    "totalPrintedPages": 2,
    "files": [
      {
        "fileId": "c19e0a77-5f2d-4b8e-8f0e-2a6b9d1c3e44",
        "name": "holiday.jpg",
        "format": "JPG",
        "pageCount": 1,
        "downloadPath": "/api/kiosk/orders/8a3f…/files/c19e…?variant=print",
        "print": {
          "downloadPath": "/api/kiosk/orders/8a3f…/files/c19e…?variant=print",
          "mimeType": "application/pdf",
          "pageCount": 1,
          "pages": "all",
          "sha256": "9b1c…"
        },
        "original": {
          "downloadPath": "/api/kiosk/orders/8a3f…/files/c19e…?variant=original",
          "mimeType": "image/jpeg",
          "pageCount": 1,
          "sha256": "41d0…"
        },
        "settings": {
          "paperSize": "A4",
          "colorMode": "COLOR",
          "copies": 2,
          "pages": "all",
          "selectedPageCount": 1,
          "printedPages": 2,
          "imageAdjustment": { "rotation": 90, "crop": { "x": 0, "y": 0.1, "w": 1, "h": 0.8 }, "zoom": 1.08, "offsetX": 0, "offsetY": 0 }
        }
      }
    ]
  }
}
```

`files` always has **exactly one** entry (kept as an array so the shape is stable).

### 4.2 `POST /api/kiosk/orders/{orderId}/claim`

Call when the customer confirms. Atomically moves `PAID → PROCESSING` and records which kiosk claimed it. If two kiosks (or a double tap) claim at the same time, exactly one succeeds; the other gets `409 ALREADY_PROCESSING`.

Request: `{ "code": "PN482917" }` (must match the order).
Response `200`: same shape as lookup, with `"status": "PROCESSING"`.

### 4.3 `GET /api/kiosk/orders/{orderId}/files/{fileId}?variant=print|original`

- `variant=print` (default): the **print-ready PDF**. Print this.
- `variant=original`: the customer's untouched upload (for reference or re-processing only).

Only works while the order is `PROCESSING` **and** was claimed by this kiosk.

**Delivery:**
- Files up to 4 MB come straight back (`200`, body = file).
- Larger files answer **`302 Found`** with a `Location` header pointing to a **5-minute signed link** on Vercel Blob storage. Vercel Functions can't return more than 4.5 MB. **Your HTTP client must follow redirects** (`curl -L`, Python `requests` does by default). Don't store the link; request a fresh one if it expires.

Response headers: `X-File-Variant` (`print`/`original`), `X-File-Sha256` (also in the lookup response as `print.sha256` / `original.sha256` for checking after a redirect), and for direct responses `Content-Type` and `Content-Disposition`.

### 4.4 `POST /api/kiosk/orders/{orderId}/complete`

Call after printing finished. `PROCESSING → COMPLETED`. Calling it again is harmless.

Response `200`: `{ "order": { "orderId": "8a3f…", "status": "COMPLETED", "completedAt": "2026-11-05T10:01:02.000Z" } }`

### 4.5 `POST /api/kiosk/orders/{orderId}/fail`

Request: `{ "reason": "Paper jam on tray 1", "retryable": true }`
- `retryable: true` → order returns to `PAID`; the same code works again.
- `retryable: false` → order becomes `FAILED`; the customer is told to contact support.

Response `200`: `{ "order": { "orderId": "…", "status": "PAID" } }`

## 5. How to print an order

1. Download `files[0].downloadPath` (the print file). It is always a **PDF**.
2. Print **pages `print.pages`** of that PDF. This is normally `"all"`; only if the server couldn't extract the pages does it contain a range like `"1-3,5"`.
3. Print `settings.copies` copies, **collated**, **single-sided**, on **A4**.
4. `settings.colorMode`: `BW` → grayscale/black only; `COLOR` → full color.
5. **Print at 100 % / "actual size"**. Do **not** use "fit to page" or "shrink to fit". The PDF is already exactly A4 with a 5 mm margin built in.

What the print file contains:

| Upload | Print file |
|---|---|
| JPG / PNG | 1-page A4 PDF with the customer's crop, 90° rotation, size and position applied (full original resolution). |
| PDF, all pages | The original PDF, unchanged. |
| PDF, some pages | A new PDF with only the selected pages, in order, page content unchanged. |

`settings.pages` always describes the selection relative to the **original** document (e.g. `"1-2,4"`), for display on the kiosk screen.

## 6. Errors

All errors look like:
```json
{ "error": { "code": "ALREADY_COMPLETED", "message": "This order has already been printed." } }
```
`message` is written for customers and can be shown on the kiosk screen as-is.

| HTTP | `code` | When | Suggested kiosk message |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Bad/missing key or kiosk ID | (kiosk configuration problem; show "Kiosk unavailable") |
| 404 | `INVALID_CODE` | Code doesn't exist, malformed, or doesn't match the order | "Code not found. Please check and try again." |
| 409 | `NOT_PAID` | Order not paid | (shouldn't happen: unpaid orders have no code) |
| 409 | `ALREADY_PROCESSING` | Another kiosk is printing it | "This order is already being printed." |
| 409 | `ALREADY_COMPLETED` | Already printed | "This order has already been printed." |
| 409 | `ORDER_FAILED` | Previously failed permanently | "Please contact support." |
| 409 | `NOT_CLAIMED` | Download/complete/fail without claiming first, or claimed by another kiosk | (kiosk logic error) |
| 404 | `FILE_NOT_FOUND` | File missing or already cleaned up | "Please contact support." |
| 410 | `EXPIRED` | Paid but not collected within 7 days | "This code has expired." |
| 410 | `CANCELLED` | Customer cancelled | "This order was cancelled." |
| 429 | `RATE_LIMITED` | 5 wrong codes from this kiosk within 10 minutes | "Too many attempts. Please wait a few minutes." (`retryAfterSeconds` included) |
| 500 | `INTERNAL_ERROR` | Server problem | "Something went wrong. Please try again." |

## 7. Try it with curl

```bash
export BASE=https://printnow-web.vercel.app
export KEY=pnk_xxx
export KIOSK=kiosk-01
```

```bash
curl -s -X POST "$BASE/api/kiosk/lookup" -H "Authorization: Bearer $KEY" -H "X-Kiosk-Id: $KIOSK" -H "Content-Type: application/json" -d '{"code":"PN482917"}'
```

```bash
curl -s -X POST "$BASE/api/kiosk/orders/<orderId>/claim" -H "Authorization: Bearer $KEY" -H "X-Kiosk-Id: $KIOSK" -H "Content-Type: application/json" -d '{"code":"PN482917"}'
```

```bash
curl -s -L -o print.pdf "$BASE/api/kiosk/orders/<orderId>/files/<fileId>?variant=print" -H "Authorization: Bearer $KEY" -H "X-Kiosk-Id: $KIOSK"
```

```bash
curl -s -X POST "$BASE/api/kiosk/orders/<orderId>/complete" -H "Authorization: Bearer $KEY" -H "X-Kiosk-Id: $KIOSK"
```

Health check (no auth): `GET /api/health` → `{"status":"ok","database":"ok",...}`

## 8. Notes & limitations

- The kiosk must have internet access; there is no offline mode.
- An order stuck in `PROCESSING` (kiosk crashed mid-print) is **not** automatically reset, to avoid printing twice. Either the same kiosk calls `/fail` with `retryable: true` after restarting, or staff reset it in the database.
- Files (original and print) are deleted ~24 h after completion, so download and print right after claiming.
- Test end-to-end against the production URL with a test order. Preview deployments are protected by Vercel login.
