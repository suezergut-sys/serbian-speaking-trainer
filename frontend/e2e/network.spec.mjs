import { expect, test } from "@playwright/test";
import { installSyntheticMicrophone } from "./flow.mjs";

const topic = {
  id: "bank", title_ru: "В банке", description_ru: "Счёт и платежи",
  likely_intents: ["открыть счёт"], suggested_vocabulary: ["račun"], is_custom: false, phrase_count: 20,
};
const session = {
  id: "session-1", status: "active", level: "A2", started_at: "2026-09-29T10:00:00Z",
  requested_length: 10, completed_count: 0,
  topic: { ...topic, source: "preset", target_level: "A2", excluded_domains: [], normalized_prompt_context: "Разговор в банке" },
};
const exercise = (id, source) => ({
  id, session_id: session.id, source_ru: source, targeted_skills: ["modal_verbs"],
  expected_level: "A2", difficulty: 1, word_hints: [],
});
const account = {
  id: "user-1", email: "learner@example.invalid", display_name: "Ученик", avatar_url: null,
  role: "user", access_tier: "free", registered_at: "2026-09-01T10:00:00Z",
  last_active_at: "2026-09-29T10:00:00Z",
  daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: "2026-09-30T00:00:00Z" },
};
const attempt = (requestBody) => ({
  id: "attempt-1", exercise_id: requestBody.exercise_id, transcript_sr: requestBody.transcript_sr,
  overall_score: 0.96, base_score: 0.96, hint_penalty: 0, daily_usage: account.daily_usage,
  analysis: { verdict: "correct", semantic_score: 0.96, grammar_score: 0.96,
    lexical_score: 0.96, naturalness_score: 0.96, pronunciation_score: null,
    fluency_score: 1, corrected_sr: requestBody.transcript_sr,
    short_feedback_ru: "Верный перевод.", detailed_feedback_ru: "Верный перевод.",
    accepted_alternatives: [], issues: [], demonstrated_skills: [] },
});

async function installApp(page, overrides = {}) {
  await installSyntheticMicrophone(page);
  const state = { topics: 0, start: 0, transcription: 0, attempts: [], next: [], savedAttempts: 0, ...overrides };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/auth/me" && method === "GET") return json(route, account);
    if (path === "/api/topics" && method === "GET") {
      state.topics += 1;
      if (state.failTopics && state.topics === 1) return route.abort("failed");
      return json(route, [topic]);
    }
    if (path === "/api/review-phrases/summary" && method === "GET") return json(route, { phrase_count: 0 });
    if (path === "/api/sessions/start" && method === "POST") {
      state.start += 1;
      if (state.failStart && state.start === 1) return route.abort("failed");
      return json(route, { session, exercise: exercise("exercise-1", "Я хочу открыть счёт.") });
    }
    if (path === "/api/transcriptions" && method === "POST") {
      state.transcription += 1;
      if (state.failTranscription && state.transcription === 1) return route.abort("failed");
      return json(route, { text: "Želim da otvorim račun." });
    }
    if (path === "/api/attempts" && method === "POST") {
      const body = request.postDataJSON();
      state.attempts.push(body);
      if (state.failAttempt && state.attempts.length === 1) return route.abort("failed");
      state.savedAttempts += 1;
      return json(route, attempt(body));
    }
    if (path === "/api/sessions/session-1/next-exercise" && method === "POST") {
      const body = request.postDataJSON();
      state.next.push(body);
      if (state.failNext && state.next.length === 1) return route.abort("failed");
      if (state.pendingNext) {
        await state.pendingNext;
        return json(route, exercise("exercise-2", "Мы можем поговорить завтра."));
      }
      return json(route, exercise("exercise-2", "Мы можем поговорить завтра."));
    }
    throw new Error(`Unexpected mocked API request: ${method} ${path}`);
  });
  await page.goto("/privacy");
  await page.evaluate(() => localStorage.setItem("sb-e2e-auth-auth-token", JSON.stringify({
    access_token: "e2e-local-only", refresh_token: "e2e-local-only", token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365, expires_at: 4102444800,
    user: { id: "user-1", aud: "authenticated", role: "authenticated", email: "learner@example.invalid",
      app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T10:00:00Z" },
  })));
  await page.goto("/?perf=1");
  return state;
}

async function startPractice(page) {
  await page.getByRole("button", { name: /В банке/ }).first().click();
  await expect(page.locator(".practice-stage .interactive-phrase")).toBeVisible();
}

test("disconnected topics request exposes an explicit retry", async ({ page }) => {
  const state = await installApp(page, { failTopics: true });
  await expect(page.getByRole("status", { name: "Backend недоступен" })).toBeVisible();
  await page.getByRole("button", { name: "Повторить загрузку тем" }).click();
  await expect(page.getByRole("button", { name: /В банке/ }).first()).toBeVisible();
  await expect(page.getByRole("status", { name: "Backend готов" })).toBeVisible();
  expect(state.topics).toBe(2);
});

async function transcribeSyntheticAnswer(page) {
  await page.getByRole("button", { name: "Ответить голосом" }).click();
  await page.getByRole("button", { name: "Завершить запись" }).click();
  const answer = page.getByLabel("Ваш ответ");
  await expect(answer).toBeVisible();
  await answer.fill("Želim da otvorim račun.");
}

async function submit(page) {
  await page.getByRole("button", { name: "Проверить ответ" }).click();
}

test("failed session start can be retried from the selected topic", async ({ page }) => {
  const state = await installApp(page, { failStart: true });
  await expect(page.getByRole("alert")).toContainText("Не удалось подготовить");
  await page.getByRole("button", { name: /В банке/ }).first().click();
  await expect(page.locator(".practice-stage .interactive-phrase")).toBeVisible();
  expect(state.start).toBe(2);
});

test("transcription network failure leaves recording retry available", async ({ page }) => {
  const state = await installApp(page, { failTranscription: true });
  await startPractice(page);
  await page.getByRole("button", { name: "Ответить голосом" }).click();
  await page.getByRole("button", { name: "Завершить запись" }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось расшифровать речь");
  await expect(page.getByRole("alert")).toContainText("Проверьте интернет-соединение");
  await page.getByRole("button", { name: "Ввести ответ вручную" }).click();
  await page.getByLabel("Ваш ответ").fill("Želim da otvorim račun.");
  await expect(page.getByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeVisible();
  await page.getByRole("button", { name: /Ответить голосом|Записать заново/ }).click();
  await page.getByRole("button", { name: "Завершить запись" }).click();
  await expect(page.getByLabel("Ваш ответ")).toHaveValue("Želim da otvorim račun.");
  expect(state.transcription).toBe(2);
});

test("disconnected attempt preserves the draft and retries with the same ID once", async ({ page }) => {
  const state = await installApp(page, { failAttempt: true });
  await startPractice(page);
  await transcribeSyntheticAnswer(page);
  await submit(page);
  await expect(page.getByRole("alert")).toContainText("Не удалось проверить ответ");
  await expect(page.getByLabel("Ваш ответ")).toHaveValue("Želim da otvorim račun.");
  await submit(page);
  await expect(page.locator(".practice-stage .feedback")).toBeVisible();
  expect(state.attempts).toHaveLength(2);
  expect(state.attempts[0].client_request_id).toBeTruthy();
  expect(state.attempts[1].client_request_id).toBe(state.attempts[0].client_request_id);
  expect(state.savedAttempts).toBe(1);
});

test("failed next-phrase prefetch retries with the same request ID", async ({ page }) => {
  const state = await installApp(page, { failNext: true });
  await startPractice(page);
  await transcribeSyntheticAnswer(page);
  await submit(page);
  await expect(page.locator(".practice-stage .feedback")).toBeVisible();
  await expect.poll(() => state.next.length).toBe(1);
  await page.getByRole("button", { name: "Следующая фраза" }).click();
  await expect(page.locator(".practice-stage .interactive-phrase")).toHaveAttribute("aria-label", "Мы можем поговорить завтра.");
  expect(state.next).toHaveLength(2);
  expect(state.next[1].client_request_id).toBe(state.next[0].client_request_id);
});

test("late next-phrase response after leaving the session is ignored", async ({ page }) => {
  let releaseNext;
  const pendingNext = new Promise((resolve) => { releaseNext = resolve; });
  const state = await installApp(page, { pendingNext });
  await startPractice(page);
  await transcribeSyntheticAnswer(page);
  await submit(page);
  await expect(page.locator(".practice-stage .feedback")).toBeVisible();
  await expect.poll(() => state.next.length).toBe(1);
  await page.getByRole("button", { name: "SerboTalk — к практике" }).click();
  releaseNext();
  await expect(page.locator(".practice-stage .interactive-phrase")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /В банке/ }).first()).toBeVisible();
});

async function json(route, value) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
}
