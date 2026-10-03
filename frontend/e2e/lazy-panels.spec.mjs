import { expect, test } from "@playwright/test";

const account = {
  id: "user-1", email: "learner@example.invalid", display_name: "Ученик", avatar_url: null,
  role: "admin", access_tier: "free", registered_at: "2026-09-01T10:00:00Z",
  last_active_at: "2026-09-29T10:00:00Z",
  daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: "2026-09-30T00:00:00Z" },
};

test("secondary panels load on demand while practice remains usable", async ({ page }) => {
  const assets = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/")) assets.push(request.url());
  });
  let finishStatistics;
  const slowStatistics = new Promise((resolve) => { finishStatistics = resolve; });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/statistics/phrases") {
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({total:0,page:1,page_size:"10",total_pages:0,groups:[]})});
      return;
    }
    let body;
    if (path === "/api/auth/me") body = account;
    else if (path === "/api/topics") body = [{
      id: "bank", title_ru: "В банке", description_ru: "Счёт и платежи", likely_intents: [],
      suggested_vocabulary: [], is_custom: false, phrase_count: 20,
    }];
    else if (path === "/api/review-phrases/summary") body = { phrase_count: 0 };
    else if (path === "/api/sessions/start") body = {
      session: { id: "lazy-session", status: "active", level: "A2", started_at: "2026-10-02T09:00:00Z", requested_length: 10, completed_count: 0,
        topic: { id: "bank", title_ru: "В банке", description_ru: "Счёт и платежи", source: "preset", target_level: "A2", likely_intents: [], suggested_vocabulary: [], excluded_domains: [], normalized_prompt_context: "Банк" } },
      exercise: { id: "lazy-exercise", session_id: "lazy-session", source_ru: "Я хочу открыть счёт.", targeted_skills: [], expected_level: "A2", difficulty: 1, word_hints: [] },
    };
    else if (path === "/api/statistics/monthly") {
      await slowStatistics;
      const now = new Date();
      body = {
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        active_days: 0, total_phrases: 0, total_translations: 0, correct_translations: 0,
        mastered_phrases: 0, days: [],
      };
    } else if (path === "/api/admin/users") body = [{
      id: account.id, email: account.email, display_name: account.display_name,
      role: "admin", access_tier: "free", registered_at: account.registered_at,
      last_active_at: account.last_active_at, phrases_today: 0,
    }];
    else throw new Error(`Unexpected API request: ${path}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/privacy");
  await page.evaluate(() => {
    localStorage.setItem("sb-e2e-auth-auth-token", JSON.stringify({
      access_token: "e2e-local-only", refresh_token: "e2e-local-only", token_type: "bearer",
      expires_in: 60 * 60 * 24 * 365, expires_at: 4102444800,
      user: { id: "user-1", aud: "authenticated", role: "authenticated", email: "learner@example.invalid",
        app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T10:00:00Z" },
    }));
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Темы для практики" })).toBeVisible();
  expect(assets.some((url) => /StatisticsView|AdminUsersView/.test(url))).toBe(false);

  await page.getByRole("button", { name: "Статистика" }).click();
  await expect(page.getByRole("navigation", { name: "Выбор недели" })).toBeVisible();
  await expect.poll(() => assets.some((url) => /StatisticsView/.test(url))).toBe(true);
  await page.getByRole("button", { name: "Пользователи" }).click();
  await expect(page.getByRole("heading", { name: "Пользователи" })).toBeVisible();
  await expect.poll(() => assets.some((url) => /AdminUsersView/.test(url))).toBe(true);
  finishStatistics();
  await page.getByRole("button", { name: "Статистика" }).click();
  await expect(page.getByRole("navigation", { name: "Выбор недели" })).toBeVisible();
  await page.getByRole("button", { name: "Практика" }).click();
  await expect(page.getByRole("heading", { name: "Темы для практики" })).toBeVisible();
});

test("statistics chunk can be retried after a network failure", async ({ page }) => {
  let requests = 0;
  await page.route("**/assets/StatisticsView-*.js*", async (route) => {
    requests += 1;
    if (requests === 1) await route.abort("failed");
    else await route.continue();
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/statistics/phrases") {
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({total:0,page:1,page_size:"10",total_pages:0,groups:[]})});
      return;
    }
    const now = new Date();
    const body = path === "/api/auth/me" ? account
      : path === "/api/topics" ? []
        : path === "/api/review-phrases/summary" ? { phrase_count: 0 }
          : path === "/api/statistics/monthly" ? {
            month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
            active_days: 0, total_phrases: 0, total_translations: 0, correct_translations: 0,
            mastered_phrases: 0, days: [],
          }
          : undefined;
    if (body === undefined) throw new Error(`Unexpected API request: ${path}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/privacy");
  await page.evaluate(() => {
    localStorage.setItem("sb-e2e-auth-auth-token", JSON.stringify({
      access_token: "e2e-local-only", refresh_token: "e2e-local-only", token_type: "bearer",
      expires_in: 60 * 60 * 24 * 365, expires_at: 4102444800,
      user: { id: "user-1", aud: "authenticated", role: "authenticated", email: "learner@example.invalid",
        app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T10:00:00Z" },
    }));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Статистика" }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось открыть раздел");
  await page.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(page.getByRole("navigation", { name: "Выбор недели" })).toBeVisible();
  expect(requests).toBe(2);
});
