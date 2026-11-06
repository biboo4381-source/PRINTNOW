# Test Report

Last updated: 6 November 2026 · **Revision 2: single document per order + image adjustment · kiosk on any screen**
Build: Next.js 16.4.5 production build

## Summary

| Suite | Tool | Result |
|---|---|---|
| Unit: pricing, page ranges, codes, file detection, PDF checks, A4 layout, image metadata/EXIF, crop/rotation maths, **printer simulation** | Vitest | **49 / 49 passed** |
| Integration: orders, print-ready output, payment, kiosk flow, cleanup, auth, **kiosk pairing sessions, print-job preparation, recovery** | Vitest | **43 / 43 passed** |
| End-to-end, website: real browser against the production build | Playwright, 3 devices × 7 specs | **21 / 21 passed** |
| End-to-end, **kiosk**: laptop 1366×768 (mouse), laptop 1280×720 (mouse), touchscreen monitor 1920×1080, tablet 1366×1024 (touch) | Playwright, 4 screens × 8 specs | **32 / 32 passed** |
| Type check / lint / production build | tsc, ESLint, `next build` | **Clean** |

Devices: Desktop 1280×800, Pixel 7 (412×915), small phone 360×640. Every page in the flow is checked for sideways scrolling.

```bash
npm test
```

```bash
npm run build && npm run test:e2e
```

## Kiosk checks

| Requirement | How it is tested | Result |
|---|---|---|
| Unpaired devices can't use the kiosk | `/kiosk` → setup; `/kiosk/api/lookup` → 401; wrong key rejected; no cookie set | ✅ |
| Kiosk key never in the browser | Session cookie is HttpOnly, SameSite=Strict, does not contain the key; tampered/expired sessions and rotated keys are rejected (integration) | ✅ |
| Home with exactly two options; UPLOAD FILE shows the permanent QR | QR links to `https://printnow-web.vercel.app/print` and is identical after reload (no sessions); Back to home | ✅ |
| Numeric keypad: enter, delete, clear, confirm | Taps/clicks on the on-screen keypad and a physical keyboard (digits + Enter); Confirm disabled until 6 digits | ✅ |
| Invalid / completed / processing codes | "Code not found" (digits kept for correction), "Already printed", "Already being printed" | ✅ |
| Order confirmation details | Name, format, page count, mode, copies, selected pages, sheets, amount paid; looking at the order doesn't change it; CANCEL / BACK leaves it PAID | ✅ |
| **Full website → kiosk journey** | Order placed through the real phone website (PDF, pages 1-3, colour, 2 copies) → code at the kiosk → CONFIRM & PRINT → order locked while printing → 6 sheets with real page preview → COMPLETED; the customer's order page shows "Printed"; reusing the code says "Already printed" | ✅ |
| Uses the actual document and settings | Server re-reads the print file and verifies SHA-256, PDF validity and page count before printing; a tampered checksum marks the order FAILED (integration); sheets = pages × copies, collated | ✅ |
| No duplicate printing | Two kiosk screens confirm the same code: one prints, the other gets "Already being printed" | ✅ |
| Printing failure | Simulated paper jam (staff menu) → "Printing stopped, your code still works" → order back to PAID → retry prints | ✅ |
| Crash recovery | An order left in PROCESSING by this kiosk shows "Unfinished print found" → Release → PAID | ✅ |
| Shared terminal privacy | Inactivity countdown, then back to home | ✅ |
| Fits any screen | Home and Upload checked for no scrolling on all four test screens. Every kiosk screen also measured at 1280×720, 1366×768, 1920×1080 and 1024×1366 portrait: no overflow. A 390×844 phone works with some scrolling | ✅ |
| Laptop keyboard | Staff menu opens with Ctrl + Alt + K (as well as the 2-second logo press); code typed on the keyboard | ✅ |
| Simulation clearly labelled | "Simulation mode · no printer" badge, "SIMULATED PRINTING" banner, completion note; completions logged as `OK_SIMULATED` | ✅ |

## Revision 2 checks (requested list)

| Requested test | How it is tested | Result |
|---|---|---|
| **Single-file upload** | File picker is single-select; dropping 2 files keeps the first and explains why (E2E). Server rejects an order with several files (`ONE_FILE_ONLY`) and a file reused in a second order (integration). No "max 5 files" text anywhere (E2E). | ✅ |
| **File replacement and removal** | E2E: Replace → unsupported `.txt` (error) → 21 MB file (error) → disguised `.pdf` (server error) → valid JPG (ready); Remove returns to the empty upload area; Continue is disabled until a valid file is ready. | ✅ |
| **JPG/PNG image adjustment** | E2E: rotate 90°, crop by dragging a corner handle, Fill page, drag to reposition. Integration: JPG and PNG render; invalid adjustments (e.g. 45°) are refused. Unit: crop/rotation conversions round-trip at 0/90/180/270°. | ✅ |
| **Image preview and A4 output** | E2E: A4 preview shows the default Fit layout (white above/below a landscape photo); settings page shows an A4 thumbnail; integration: print file is exactly one A4 page (595.28 × 841.89 pt). | ✅ |
| **PDF preview and page selection** | E2E: thumbnails for every page render; tapping pages updates the range (`1-2,4`); typed ranges update the selected thumbnails; invalid page blocks Continue; enlarged page preview opens/closes. | ✅ |
| **Printing settings** | E2E: B&W/Color and copies on the Settings step with the order summary; summary shows `1-2,4 (3 of 5)` and `3 × 2 = 6`. | ✅ |
| **Price calculation** | E2E: Rp 1.500 → 4.500 → 9.000 as settings change; server recalculates (integration). Images always count as 1 page. | ✅ |
| **Preservation of adjusted output for the kiosk** | **E2E pixel comparison:** after rotate + crop + fill + move, 35 sample points of the browser preview are compared with the server's print PDF (downloaded through the kiosk API and rendered with pdf.js). They match (≤1 edge mismatch allowed, 0 observed). The original upload is downloaded too and is byte-identical to what was uploaded. PDF page selection → kiosk print file has exactly 3 pages; original still has 5. | ✅ |

## Original required scenarios (brief §10)

| # | Scenario | Result |
|---|---|---|
| 1 | Upload a valid PDF (incl. 40-page PDF: no page restriction) | ✅ |
| 2 | Upload a valid JPG or PNG (pixel size recorded) | ✅ |
| 3 | Unsupported file rejected and deleted | ✅ |
| 4 | Oversized file rejected | ✅ |
| 5–6 | Black & white / color | ✅ |
| 7 | Number of copies | ✅ |
| 8 | Specific pages | ✅ |
| 9 | Total updates correctly | ✅ |
| 10–11 | Simulated payment, unique code (idempotent, concurrent-safe) | ✅ |
| 12 | Unpaid orders have no usable code; other browsers can't open/pay the order | ✅ |
| 13–14 | Code retrieves the right order, print file, original, settings and image adjustment | ✅ |
| 15 | Completed orders can't be printed again; two kiosks can't both claim | ✅ |
| 16 | Mobile and desktop | ✅ |

## Issues found and fixed during this revision

| Issue | Fix |
|---|---|
| −/+ buttons showed tiny squashed icons (conflicting Tailwind padding classes) | Added `tailwind-merge` so per-button overrides always win |
| Crop editor sat under the sticky Continue bar on phones | Crop now opens as a full-screen editor |
| Page-preview dialog controls overlapped on 360 px phones | Close at the top, Previous/Next as a full-width row at the bottom |
| Long file names without spaces widened the page | Text wraps long words site-wide |
| Kiosk download streamed files through a Vercel Function (4.5 MB response limit) | Files over 4 MB are served through a 5-minute signed Blob link (302 redirect) |

## Known limitations / not yet tested

- **Production uploads to Vercel Blob and the signed-link (302) download path** can only be exercised on the live site. Automated tests use local storage. A manual run on the live site is still needed: one photo order and one PDF order with selected pages.
- **Real phones**: emulated in Chromium only. Check once on a real iPhone (Safari) and Android phone, especially pinch-to-zoom and dragging in the image editor.
- **Mirrored phone photos** (rare EXIF orientations 2/4/5/7) are printed as the nearest rotation without the mirror flip.
- **Very large PNGs** are capped at 40 megapixels (JPEG at 120 MP), because PNGs must be decoded to build the print PDF.
- **Printer margins**: the print PDF keeps a 5 mm margin. If Jonathan's printer needs a larger margin, change `PRINT_MARGIN_MM` in `lib/image-layout.ts`; preview and print update together.
- **Kiosk on the real device**: tested in Chromium at laptop, monitor and tablet sizes. Still to do on the actual kiosk laptop/screen: full-screen (F11 or Chrome `--kiosk`), power settings, and the checklist in `docs/KIOSK_GUIDE.md` §3. On an iPad: Safari, Add to Home Screen, Guided Access.
- **Real printing**: not possible on the prototype (no printer; a web page can't print silently). Printing is simulated and labelled as such.
