import { defineConfig } from "@playwright/test";

// Runs against a live stack: backend on :8000 started with AIF_ENABLE_TEST_PROVIDER=true and the frontend on :3000.
// See docs/TESTING.md. The test switches the AI Model block to the labelled "Test mock (not AI)" provider
// because no real model is available in CI.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  reporter: [["list"]],
});
