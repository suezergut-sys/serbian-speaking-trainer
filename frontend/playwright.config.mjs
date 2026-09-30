import { defineConfig } from "@playwright/test";

// Playwright's failure snapshot can serialize form values, including testlab credentials.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const live = Boolean(process.env.TESTLAB_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: "./test-results",
  use: {
    baseURL: live ? process.env.TESTLAB_BASE_URL : "http://127.0.0.1:5179",
    browserName: "chromium",
    channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: live ? undefined : {
    command: "node node_modules/vite/bin/vite.js build --mode e2e --outDir dist-e2e && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5179 --strictPort --outDir dist-e2e",
    url: "http://127.0.0.1:5179/",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_API_BASE_URL: "",
      VITE_SUPABASE_URL: "https://e2e-auth.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-public-key",
    },
  },
});
