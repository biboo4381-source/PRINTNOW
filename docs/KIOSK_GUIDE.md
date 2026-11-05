# PRINTNOW Kiosk: Setup & Operations Guide

Kiosk URL: **https://printnow-web.vercel.app/kiosk** · Device: 13-inch iPad, landscape · Mode: **simulated printing** (no printer)

The kiosk is part of the PRINTNOW website project. It uses the same backend and database, so orders paid on the website can be collected here with their collection code.

## 1. One-time iPad setup (staff, about 10 minutes)

1. **Network:** connect the iPad to reliable Wi-Fi. The kiosk needs internet for every code check.
2. **Pair the iPad:**
   - Open Safari at `https://printnow-web.vercel.app/kiosk`. It redirects to **Kiosk setup**.
   - Enter **Kiosk ID** `kiosk-01` and the **kiosk key** (from the team's password manager), then tap **Pair this device**.
   - The server checks the key and stores a secure session on the iPad, valid for 180 days. The key itself is not kept on the iPad.
3. **Full screen:** in Safari tap **Share → Add to Home Screen** ("PRINTNOW Kiosk"), then open the kiosk from that icon. It runs without the Safari address bar.
4. **Screen settings:**
   - Settings → Display & Brightness → **Auto-Lock: Never**.
   - Turn on the orientation lock in **landscape**.
   - Raise brightness. Turn Night Shift off.
5. **Lock the iPad to the kiosk (Guided Access):**
   - Settings → Accessibility → **Guided Access → On**, then set a passcode known only to staff.
   - Open the kiosk app and **triple-click the top button**, then tap **Start**. Customers can't leave the kiosk.
   - To exit: triple-click, then enter the passcode.
6. **Test** with a real order (see §3).

## 2. Using the kiosk (customers)

| Screen | What happens |
|---|---|
| Home | **UPLOAD FILE** or **COLLECTION CODE** |
| Upload File | Permanent QR code to `printnow-web.vercel.app/print`; customer orders on their phone |
| Collection Code | Type the 6 digits after **PN** → **Confirm code** |
| Is this your order? | Document, format, pages, mode, copies, selected pages, sheets, amount paid → **CONFIRM & PRINT** or **CANCEL / BACK** |
| Printing (simulated) | Order is reserved, the real document is retrieved and checked, sheet-by-sheet progress with page preview |
| Printing complete | Order is marked **COMPLETED**; the kiosk returns home after 12 s |

Any screen except printing returns home after **60 s** without a touch, to protect the next customer's privacy.

## 3. Test checklist (after setup or any update)

1. On a phone, open the website, upload a small PDF, pay with the demo QRIS, and note the code.
2. At the kiosk, tap **COLLECTION CODE**, enter the code and check the details match. Tap **CONFIRM & PRINT** and wait for **Printing complete**.
3. Enter the same code again. It must say **Already printed**.
4. Enter `000000`. It must say **Code not found**.
5. Tap **UPLOAD FILE** and scan the QR with a phone. The website must open.

## 4. Staff menu

**Press and hold the PRINTNOW logo (top left) for 2 seconds.**

| Option | Use |
|---|---|
| Simulate a paper jam on the next print | Demonstrates error handling: the print stops, the order goes back to **PAID**, and the same code works again |
| Reload kiosk | Refreshes the app |
| Kiosk setup | Shows which kiosk the iPad is paired as; unpair or re-pair |

## 5. Troubleshooting

| Problem | What to do |
|---|---|
| Kiosk shows **Kiosk setup** | The session expired, website data was cleared, or the key was changed. Pair again (§1.2) |
| Red **Offline** badge | Check Wi-Fi. The kiosk retries automatically every few minutes and when the network returns |
| **Unfinished print found** (staff action) | The kiosk stopped mid-print (closed, crashed, lost power). Tap **Release order** so the customer can reuse the code. Tap **Mark as printed** only if the pages really came out |
| Customer says the code doesn't work | Check the 6 digits. Each code works once, and only for 7 days after payment. Find the order by reference in the database (see `docs/DEPLOYMENT.md`) |
| **Too many attempts** | 5 wrong codes in 10 minutes lock code entry on this kiosk for a few minutes |

## 6. How it works (technical)

```
iPad /kiosk ──(HttpOnly kiosk-session cookie)──▶ /kiosk/api/* ──▶ lib/services/kiosk.ts ──▶ Neon (orders) + Blob (files)
```

- **Verify:** `POST /kiosk/api/lookup` runs the same rules as the REST kiosk API (paid, not expired, not processing or completed) and changes nothing.
- **Confirm & Print:**
  1. `claim`: atomic `PAID → PROCESSING`, so only one kiosk can win.
  2. `prepare`: the server loads the **actual print-ready PDF**, checks its SHA-256, that it opens, and its page count, and returns the print job (pages × copies, colour mode, A4).
  3. `file`: the PDF is downloaded for the on-screen page preview.
  4. **simulated printer**: works through every sheet of the job.
  5. `complete` → **COMPLETED**, logged as `OK_SIMULATED`.
- **Failures:**
  - A printer error (e.g. a simulated jam) → `fail(retryable)` → back to **PAID**.
  - A damaged or missing document → **FAILED** with the reason.
- **Security:**
  - The kiosk key never reaches the iPad's JavaScript.
  - An unpaired browser can't look up orders or download files.
  - Files are only available while this kiosk is printing that order.
- **Future printer:** replace `SimulatedPrinter` (`lib/kiosk/printer.ts`) with a driver for the real printer. iPad Safari can't print silently, so this needs either a small print service on a PC next to the printer (the REST API in `docs/KIOSK_API.md` is ready for it) or a cloud-print printer. The kiosk screens stay the same.

Server setting: the environment variable `KIOSK_SESSION_SECRET` signs kiosk sessions. Changing it signs out all kiosks. Removing a kiosk from `KIOSK_API_KEYS` signs out that kiosk.
