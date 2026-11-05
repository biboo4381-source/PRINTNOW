# PRINTNOW Kiosk Software: Technical Proposal

Status: **Approved and implemented** (landscape, English, kiosk-01) · Date: 5 November 2026

> Implementation note: the kiosk runs as one full-screen page at `/kiosk` that switches between screens internally (no browser history to get lost in), plus `/kiosk/setup` for pairing. Operation guide: `docs/KIOSK_GUIDE.md`.
Scope: the kiosk touchscreen interface (13-inch iPad prototype, no physical printer), integrated with the existing PRINTNOW website, backend and database.

---

## 1. What already exists and can be reused

| Existing piece | Where | Reuse in the kiosk |
|---|---|---|
| Order database (orders, uploaded files, print settings, payments, kiosk logs) | Neon Postgres, `lib/db/schema.ts` | **Same database**: no new order store |
| Code check: found / paid / processing / completed / expired / failed | `lookupByCode()` in `lib/services/kiosk.ts` | Used as-is for the code screen |
| Atomic claim (`PAID → PROCESSING`, only one kiosk can win) | `claimOrder()` | Used as-is when the customer taps **Confirm & Print** |
| Print-ready file and settings (A4 PDF for photos, selected pages for PDFs) | `getFileForKiosk()` + `print_settings` | Used to retrieve and check the actual document |
| Complete / fail (retryable → back to PAID) | `completeOrder()`, `failOrder()` | Used after simulated printing |
| Wrong-code rate limit (5 tries / 10 min per kiosk), audit log | `kiosk_logs` | Used as-is |
| Code formatting (`PN 482 917`, forgiving input) | `lib/codes.ts` | Keypad display and input |
| QR generation, pdf.js preview, design tokens, Button/Card/Logo | website components | Kiosk screens, same visual identity |
| REST kiosk API with API keys | `/api/kiosk/*` (docs/KIOSK_API.md) | Kept for a future native kiosk/printer app; **not** used by the iPad browser (see §2) |

## 2. Recommended architecture

**The kiosk is a new section of the same Next.js app: `/kiosk`.** It is deployed with the website on Vercel and calls the same business logic directly on the server.

```
 iPad (Safari, full-screen)                Vercel: printnow-web (one app)                  Shared
 ─────────────────────────                 ───────────────────────────────                  ──────
 /kiosk            Home                    /kiosk/api/*  (kiosk-session cookie auth) ──┐
 /kiosk/upload     QR → /print             /api/kiosk/*  (API-key auth, unchanged)  ───┤→ lib/services/kiosk.ts ─→ Neon Postgres
 /kiosk/code       Keypad                  /print, /pay, … (customer website)       ───┘   lib/services/orders.ts ─→ Vercel Blob
 /kiosk/confirm    Order details
 /kiosk/print      Simulated printing
```

**Why a section of the same app, not a separate project?** Earlier I suggested a separate repo. That assumed a native kiosk program next to a printer. Now that the kiosk is a touchscreen **web interface on an iPad**:
- Same backend code, so there is **no second implementation** of order rules to keep in sync.
- One deploy and one URL, so nothing extra to host.
- Same design components, so it stays visually consistent.

**Keeping the kiosk key safe:**
- The existing kiosk API key must never live in browser JavaScript, where anyone could read it.
- Instead, staff **pair the iPad once** at `/kiosk/setup` by entering the kiosk ID and key.
- The server checks the key and stores a **signed, HttpOnly kiosk-session cookie** on the iPad, valid for 180 days. Page scripts can't read it.
- Every kiosk action is authorised by that cookie on the server.
- An un-paired browser opening `/kiosk` sees the setup screen and cannot look up any order.

## 3. Screen-by-screen workflow (iPad 13", landscape, 1366×1024)

```
            ┌──────────── HOME ────────────┐
            │  [ UPLOAD FILE ] [ COLLECTION CODE ] │
            └─────┬───────────────────┬────┘
                  ▼                   ▼
          UPLOAD (QR)           CODE ENTRY (keypad)
          QR → /print            PN [_ _ _ _ _ _]
          3 scan steps           0–9 · Delete · Clear · CONFIRM
          [Back to home]               │ verify
                                       ▼
                    ┌──── error ──── ORDER CHECK ──── ok ────┐
                    ▼                                         ▼
           MESSAGE SCREEN                          ORDER CONFIRMATION
           (not found / unpaid,                    name, format, pages, mode,
           already printed, being                  copies, selected pages,
           printed, expired, too                   printed sheets, total paid
           many attempts)                          [CANCEL / BACK] [CONFIRM & PRINT]
           [Try again] [Home]                                 │ claim (→ PROCESSING)
                                                              ▼
                                                 PRINTING (SIMULATED)
                                                 retrieve + verify document
                                                 "Printing sheet 3 of 12 · copy 1 of 2"
                                                 progress bar, page preview
                                                              │
                                     ┌──── failure ───────────┴──── success ───┐
                                     ▼                                          ▼
                              PRINT FAILED                               DONE ✓ (COMPLETED)
                              order back to PAID,                        "Collect your pages"
                              code still works                           auto-return home in 10 s
```

| Screen | Content | Notes |
|---|---|---|
| **Home** | Two very large tiles: **UPLOAD FILE** and **COLLECTION CODE**, PRINTNOW branding, "Simulation mode" badge | Returns here after every flow and after 60 s of inactivity |
| **Upload File** | Large **permanent** QR code for `https://printnow-web.vercel.app/print`, the URL in text, 3 steps (scan → upload & pay → come back with your code), **Back to home** | Static QR. No session, no kiosk-specific link |
| **Collection Code** | `PN` shown as a fixed prefix + 6 large digit boxes; 3×4 keypad (keys ≥ 96 px); **Delete**, **Clear**, **Confirm** (enabled at 6 digits) | Physical keyboards also work. Wrong code → clear message, digits kept for correction |
| **Message** | One clear sentence + icon per case, **Try again** / **Home** | Uses the existing error codes (see §4) |
| **Confirmation** | Document name, format, original page count, print mode, copies, selected pages, printed sheets (pages × copies), A4, total paid, order reference | **No order change** until Confirm. Cancel just goes back |
| **Printing (simulated)** | Banner **"SIMULATED PRINTING — prototype, no paper is printed"**; per-sheet progress; first-page preview of the actual print file | Can't be cancelled midway (like a real printer). A failure releases the order |
| **Done** | Green check, "Please collect your documents", order ref, countdown to Home | Order is now COMPLETED and can't be printed again |

Kiosk UX rules:
- Touch targets ≥ 64 px (keypad ≥ 96 px).
- Body text ≥ 24 px.
- No scrolling on the main screens.
- No text selection or zoom.
- Idle timeout: 60 s on code/confirm screens returns Home and clears the code (shared terminal privacy).
- Screen kept awake (Wake Lock).
- "Add to Home Screen" runs it full-screen, and iPad **Guided Access** locks the iPad to this app.

## 4. Collection code verification

1. The keypad sends `PN` + 6 digits to `POST /kiosk/api/lookup` (kiosk cookie).
2. The server calls the existing `lookupByCode(kioskId, code)`. It checks that the code exists and that the order is PAID, not expired, and not processing, completed, failed or cancelled. It logs the attempt and applies the wrong-code rate limit.
3. Messages shown:

| Result | Kiosk message |
|---|---|
| `INVALID_CODE` (incl. unpaid: unpaid orders never receive a code) | "We couldn't find a paid order with this code. Please check the 6 digits." |
| `ALREADY_PROCESSING` | "This order is already being printed." |
| `ALREADY_COMPLETED` | "This order has already been printed." |
| `EXPIRED` / `CANCELLED` | "This code has expired / this order was cancelled." |
| `ORDER_FAILED` | "This order can't be printed. Please contact support (reference …)." |
| `RATE_LIMITED` | "Too many attempts. Please wait a few minutes." |

The lookup returns only what the confirmation screen needs. **No document is sent to the iPad before the customer confirms.**

## 5. Document retrieval (after Confirm & Print)

1. `POST /kiosk/api/orders/{id}/claim`: the existing atomic claim, `PAID → PROCESSING`. If another kiosk or a double tap got there first, the customer sees "already being printed", and **duplicate printing is impossible**.
2. `POST /kiosk/api/orders/{id}/prepare` (**new**): the server loads the **actual print-ready file** from Blob storage. It checks its SHA-256 against the stored value, opens the PDF, and confirms the page count matches the order's settings. It returns a **print job**: file, pages to print, copies, colour mode, A4 and number of sheets. Problems such as a missing or corrupted file mark the order **failed (retryable)** with a clear message.
3. The iPad fetches the print file through `/kiosk/api/orders/{id}/file` (cookie-protected, only while this kiosk is printing it) to show the first-page preview. Files over 4 MB use a short-lived signed link, as in the existing API.

## 6. Printing simulation and future printer

- A small **printer interface** separates the UI from the hardware:
  ```ts
  interface PrinterDriver { kind: "simulated" | "real"; print(job: PrintJob, onProgress): Promise<PrintResult> }
  ```
- **`SimulatedPrinter`** (now) walks through the job's real data sheet by sheet: each selected page × each copy, in mono or colour. It reports progress ("Sheet 7 of 12 · page 4 · copy 2"), takes about 0.6 s per sheet (capped at 30 s total), and can be set to fail for testing ("simulate paper jam" in the staff menu).
- On success: `complete` → **COMPLETED**, logged as `OK_SIMULATED`. On failure: `fail(retryable)` → back to **PAID**, so the customer can try again with the same code.
- **Recovery:** if the iPad is closed mid-print, the next time the kiosk opens it detects its own unfinished job and offers staff **Resume** or **Release** (back to PAID).
- **Future real printer:** iPad Safari cannot print silently (AirPrint always shows a dialog). A real kiosk will need either:
  - **(a)** a small print service on a mini-PC beside the printer that receives jobs (the existing REST API is ready for this), or
  - **(b)** a printer with a cloud print API.

  Either one becomes a new `PrinterDriver`. The screens stay the same.

## 7. Backend / database changes

| Change | Why | Size |
|---|---|---|
| **Kiosk pairing + session cookie** (`/kiosk/setup`, new env `KIOSK_SESSION_SECRET`) | Keep the API key out of the browser | Small |
| **`/kiosk/api/*` routes** (lookup, claim, prepare, file, complete, fail, active-job) using the cookie | Kiosk UI ↔ existing services | Small: thin wrappers |
| **`prepareJob()` service** (verify actual file + build print job) | Requirement: print uses the real document and settings | Small |
| **`getActiveJobForKiosk()`** | Crash recovery | Small |
| Log results `OK_SIMULATED` / `SIMULATED_FAILURE` | Distinguish simulated from real printing in records | No schema change |
| **Database migration** | **None required.** Existing tables cover everything | — |

The existing REST kiosk API (`/api/kiosk/*`) stays unchanged for a future native printer service.

## 8. Technical limitations

- **No real printing** on the prototype. Clearly labelled as simulated, and recorded as such in the logs.
- iPad Safari can't print silently, so real printing needs an extra print service or a cloud printer (see §6).
- The kiosk needs **internet**. When offline, it shows a "Kiosk offline" screen. Without the database it can't verify codes, so there is no offline mode.
- If Safari's website data is cleared, the iPad must be **paired again** (one-minute staff task).
- Guided Access, Add-to-Home-Screen and auto-lock settings are **manual iPad setup steps** (documented checklist).
- Free-tier hosting (Neon) may make the first request after a quiet period about 1 s slower. The kiosk sends a background check every few minutes to keep it warm.

## 9. Development milestones

| # | Milestone | Output |
|---|---|---|
| K1 | Kiosk session + `/kiosk/api/*` + `prepareJob` + recovery, with tests | Secure backend ready |
| K2 | Screens: Home, Upload QR, Keypad, Message, Confirmation (iPad layout) | Clickable kiosk on the iPad |
| K3 | Printing simulation, progress, completion, failure + recovery, idle timeout | Full kiosk flow |
| K4 | End-to-end test: order on the phone website → code → kiosk (iPad 13" viewport) → COMPLETED; duplicate/invalid/expired cases | Test report |
| K5 | Deploy + iPad setup guide (pairing, Guided Access, full-screen) | Live kiosk at `/kiosk` |

## 10. Decisions needed

1. **Approve the architecture:** the kiosk as `/kiosk` inside the same app, with cookie-based kiosk pairing.
2. **Orientation:** landscape (recommended for a mounted iPad) or portrait?
3. **Language:** English like the website, or **Bahasa Indonesia** (or a language toggle)?
4. **Kiosk team (physical kiosk):** confirm the iPad is the kiosk screen and that, for now, there is no printer/PC beside it.
5. **Kiosk ID** for the prototype (proposed: the existing `kiosk-01`).
