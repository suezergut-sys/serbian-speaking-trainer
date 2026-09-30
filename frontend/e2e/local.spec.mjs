import { test } from "@playwright/test";
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
