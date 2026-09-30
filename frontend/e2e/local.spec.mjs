import { expect, test } from "@playwright/test";
import { captureMetrics } from "./metrics.mjs";
import { installSyntheticMicrophone, loginTestlab, runPracticeFlow } from "./flow.mjs";

test("real local backend with testlab auth and mocked AI", async ({ page }) => {
  if (!process.env.TESTLAB_BASE_URL) throw new Error("Set TESTLAB_BASE_URL to the isolated testlab frontend");
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):5178\/?$/.test(process.env.TESTLAB_BASE_URL)) {
    throw new Error("TESTLAB_BASE_URL must be the isolated local preview on port 5178");
  }
  const statuses = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/api/transcriptions" || path === "/api/attempts") statuses.push(`${path}:${response.status()}`);
  });
  await installSyntheticMicrophone(page);
  const saveMetrics = captureMetrics(page);
  await loginTestlab(page);
  try {
    await runPracticeFlow(page, {
      topic: /Собеседование/,
      transcript: "Radim kao računovođa u maloj firmi.",
    });
  } catch (error) {
    throw new Error(`Practice flow failed; response statuses: ${statuses.join(", ")}`, { cause: error });
  }
  await saveMetrics("local-web");
});

test("pending hint save does not block real backend scoring or duplicate the penalty", async ({ page }) => {
  await installSyntheticMicrophone(page);
  await loginTestlab(page);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let hintRequests = 0;
  await page.route("**/api/exercises/*/word-hints", async (route) => {
    hintRequests += 1;
    await pending;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Synthetic delayed save failure"}' });
  });
  try {
    await runPracticeFlow(page, {
      topic: /Собеседование/,
      transcript: "Radim kao računovođa u maloj firmi.",
      expectedScore: "92%",
      afterEdit: async () => {
        const word = page.locator(".practice-stage .interactive-phrase button").first();
        await word.click();
        await word.click();
        await expect(page.locator(".word-tooltip")).toBeVisible();
        await expect(page.locator(".word-tooltip")).not.toContainText("Загружаем");
        await expect.poll(() => hintRequests).toBe(1);
      },
    });
    // The attempt and next phrase completed while the hint POST was still paused.
    release();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(hintRequests).toBe(1);
  } finally {
    release();
  }
});
