import { createHash } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_KIOSK_ID = "kiosk-e2e";
export const E2E_KIOSK_KEY = "pnk_e2e_test_key_do_not_use_in_production";

// Use the preinstalled Chromium in this environment if present; otherwise Playwright's own.
const localChromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(localChromium) ? { executablePath: localChromium } : {};

const dataDir = mkdtempSync(path.join(tmpdir(), "printnow-e2e-"));

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    { name: "desktop", testMatch: /journey\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, launchOptions } },
    { name: "mobile", testMatch: /journey\.spec\.ts/, use: { ...devices["Pixel 7"], launchOptions } },
    { name: "small-phone", testMatch: /journey\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, launchOptions } },
    // 13-inch iPad in landscape (CSS pixels), touch input: the kiosk terminal.
    { name: "kiosk-ipad", testMatch: /kiosk\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 1024 }, isMobile: true, hasTouch: true, launchOptions } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: `pglite:${path.join(dataDir, "db")}`,
      LOCAL_STORAGE_DIR: path.join(dataDir, "uploads"),
      KIOSK_API_KEYS: `${E2E_KIOSK_ID}:${createHash("sha256").update(E2E_KIOSK_KEY).digest("hex")}`,
      CRON_SECRET: "e2e-cron-secret",
      PLAYWRIGHT_E2E: "1",
    },
  },
});
