import { expect, test } from "@playwright/test";
import { installSyntheticMicrophone } from "./flow.mjs";

test("Android layout waits for the default review exercise before showing topics and microphone", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: "android" }; });
  await installSyntheticMicrophone(page);

  let releaseTopics;
  let releaseSummary;
  let releaseStart;
  const topicsGate = new Promise((resolve) => { releaseTopics = resolve; });
  const summaryGate = new Promise((resolve) => { releaseSummary = resolve; });
  const startGate = new Promise((resolve) => { releaseStart = resolve; });
  const starts = [];
  const account = {
    id: "startup-user", email: "learner@example.invalid", display_name: "Ученик", avatar_url: null,
    role: "user", access_tier: "free", registered_at: "2026-09-01T10:00:00Z",
    last_active_at: "2026-10-02T10:00:00Z",
    daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: "2026-10-03T00:00:00Z" },
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path === "/api/auth/me") body = account;
    else if (path === "/api/topics") {
      await topicsGate;
      body = [
        { id: "rent", title_ru: "Аренда", description_ru: "Пока без фраз", likely_intents: [], suggested_vocabulary: [], is_custom: false, phrase_count: 0 },
        { id: "bank", title_ru: "В банке", description_ru: "Счёт и платежи", likely_intents: [], suggested_vocabulary: [], is_custom: false, phrase_count: 20 },
      ];
    } else if (path === "/api/review-phrases/summary") {
      await summaryGate;
      body = { phrase_count: 1 };
    } else if (path === "/api/sessions/start") {
      starts.push(route.request().postDataJSON());
      await startGate;
      body = {
        session: {
          id: "session-1", status: "active", level: "A2", started_at: "2026-10-02T10:00:00Z",
          requested_length: 10, completed_count: 0,
          topic: { id: "review-phrases", title_ru: "Фразы для повторения", description_ru: "Повторение", source: "custom", target_level: "A2", likely_intents: [], suggested_vocabulary: [], excluded_domains: [], normalized_prompt_context: "Повторение" },
        },
        exercise: { id: "exercise-1", session_id: "session-1", source_ru: "Я хочу открыть счёт.", targeted_skills: [], expected_level: "A2", difficulty: 1, word_hints: [] },
      };
    } else throw new Error(`Unexpected API request: ${path}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/privacy");
  await page.evaluate(() => {
    localStorage.setItem("sb-e2e-auth-auth-token", JSON.stringify({
      access_token: "e2e-local-only", refresh_token: "e2e-local-only", token_type: "bearer",
      expires_in: 31536000, expires_at: 4102444800,
      user: { id: "startup-user", aud: "authenticated", role: "authenticated", email: "learner@example.invalid",
        app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T10:00:00Z" },
    }));
  });
  await page.goto("/?perf=1");
  await expect(page.getByRole("status", { name: "Подготовка фразы" })).toBeVisible();
  await expect(page.locator(".android-topic-list")).toHaveCount(0);
  expect(starts).toHaveLength(0);

  releaseTopics();
  await expect(page.getByRole("status", { name: "Подготовка фразы" })).toBeVisible();
  expect(starts).toHaveLength(0);
  releaseSummary();
  await expect.poll(() => starts.length).toBe(1);
  expect(starts[0]).toEqual({ review_mode: true, length: 10 });
  await expect(page.locator(".android-topic-list")).toHaveCount(0);

  releaseStart();
  await expect(page.getByRole("button", { name: "Темы" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: /Повторение/ })).toHaveClass(/is-selected/);
  await expect(page.getByRole("button", { name: /В банке/ })).not.toHaveClass(/is-selected/);
  expect(await page.evaluate(() => performance.getEntriesByName("serbotalk:ui:first_phrase:start", "mark").length)).toBe(0);
  await page.locator(".android-pager").evaluate((pager) => {
    pager.scrollLeft = pager.clientWidth;
    pager.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(page.getByRole("button", { name: "Тренировка" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".android-training-page .interactive-phrase")).toHaveAttribute("aria-label", "Я хочу открыть счёт.");
  await expect(page.getByRole("button", { name: "Ответить голосом" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName("serbotalk:ui:first_phrase", "measure").length)).toBe(1);
  expect(starts).toHaveLength(1);
});
