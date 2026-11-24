import { defineConfig, devices } from "@playwright/test";

const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
const staging = process.env.PLAYWRIGHT_STAGING_URL;
const port = production ? 4173 : 5173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: staging ?? baseURL,
    trace: staging ? "off" : "on-first-retry",
  },
  projects:
    process.env.PLAYWRIGHT_ALL_BROWSERS === "1"
      ? [
          { name: "chromium", use: devices["Desktop Chrome"] },
          { name: "firefox", use: devices["Desktop Firefox"] },
          { name: "webkit", use: devices["Desktop Safari"] },
        ]
      : undefined,
  testMatch: staging ? "**/staging.spec.ts" : "**/*.spec.ts",
  testIgnore: staging ? [] : ["**/staging.spec.ts"],
  webServer: staging
    ? undefined
    : {
        command: `pnpm ${production ? "preview" : "dev"} --host 127.0.0.1 --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
