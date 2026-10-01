import { expect, test } from "@playwright/test";
import { loginTestlab, installSyntheticMicrophone, runPracticeFlow } from "./flow.mjs";

test("lost attempt response is replayed without adding a duplicate saved translation", async ({ page }) => {
  test.setTimeout(90_000);
  if (!process.env.TESTLAB_BASE_URL || !/^http:\/\/(?:127\.0\.0\.1|localhost):5178\/?$/.test(process.env.TESTLAB_BASE_URL)) {
    throw new Error("TESTLAB_BASE_URL must be the isolated local preview on port 5178");
  }
  await installSyntheticMicrophone(page);
  await loginTestlab(page);

  const before = await monthlyTranslationCount(page);
  const requestIds = [];
  let attemptRequests = 0;
  let committedAttemptId;
  let replayedAttemptId;
  let committedUsage;
  let replayedUsage;
  await page.route("**/api/attempts", async (route) => {
    const request = route.request();
    requestIds.push(request.postDataJSON().client_request_id);
    attemptRequests += 1;
    if (attemptRequests === 1) {
      const committed = await route.fetch();
      expect(committed.ok()).toBeTruthy();
      const body = await committed.json();
      committedAttemptId = body.id;
      committedUsage = body.daily_usage?.used;
      await committed.dispose();
      // The backend has committed the synthetic transcript, but the browser sees a lost connection.
      return route.abort("failed");
    }
    const replay = await route.fetch();
    const body = await replay.json();
    replayedAttemptId = body.id;
    replayedUsage = body.daily_usage?.used;
    return route.fulfill({ status: replay.status(), contentType: "application/json", body: JSON.stringify(body) });
  });

  await runPracticeFlow(page, {
    topic: /Собеседование/,
    transcript: "Radim kao računovođa u maloj firmi.",
    activateButton: async (name) => {
      await page.getByRole("button", { name }).click();
      if (name === "Проверить ответ") {
        await expect(page.getByRole("alert")).toContainText("Не удалось проверить ответ");
        await expect(page.getByLabel("Ваш ответ")).toHaveValue("Radim kao računovođa u maloj firmi.");
        await page.getByRole("button", { name }).click();
      }
    },
  });

  expect(attemptRequests).toBe(2);
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBeTruthy();
  expect(requestIds[1]).toBe(requestIds[0]);
  expect(committedAttemptId).toBeTruthy();
  expect(replayedAttemptId).toBe(committedAttemptId);
  expect(replayedUsage).toBe(committedUsage);
  expect(await monthlyTranslationCount(page)).toBe(before + 1);
});

async function monthlyTranslationCount(page) {
  return page.evaluate(async () => {
    const tokenEntry = Object.keys(localStorage).find((key) => key.startsWith("sb-") && key.endsWith("-auth-token"));
    if (!tokenEntry) throw new Error("Local testlab session is unavailable");
    const token = JSON.parse(localStorage.getItem(tokenEntry) ?? "{}").access_token;
    if (typeof token !== "string") throw new Error("Local testlab access token is unavailable");
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const utcOffsetMinutes = -now.getTimezoneOffset();
    const response = await fetch(`http://127.0.0.1:8765/api/statistics/monthly?month=${month}&utc_offset_minutes=${utcOffsetMinutes}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Local testlab statistics request failed");
    const data = await response.json();
    if (!Number.isInteger(data.total_translations)) throw new Error("Local testlab translation count is invalid");
    return data.total_translations;
  });
}
