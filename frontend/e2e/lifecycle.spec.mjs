import { expect, test } from "@playwright/test";

const topic = {
  id: "bank", title_ru: "В банке", description_ru: "Счёт и платежи",
  likely_intents: ["открыть счёт"], suggested_vocabulary: ["račun"], is_custom: false, phrase_count: 20,
};
const session = {
  id: "session-lifecycle", status: "active", level: "A2", started_at: "2026-09-29T10:00:00Z",
  requested_length: 10, completed_count: 0,
  topic: { ...topic, source: "preset", target_level: "A2", excluded_domains: [], normalized_prompt_context: "Разговор в банке" },
};
const exercise = { id: "exercise-lifecycle", session_id: session.id, source_ru: "Я хочу открыть счёт.", targeted_skills: [], expected_level: "A2", difficulty: 1, word_hints: [] };
const account = {
  id: "user-lifecycle", email: "learner@example.invalid", display_name: "Ученик", avatar_url: null,
  role: "user", access_tier: "free", registered_at: "2026-09-01T10:00:00Z", last_active_at: "2026-09-29T10:00:00Z",
  daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: "2026-09-30T00:00:00Z" },
};

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    // Restore the browser-owned getter so Playwright's teardown visibility event reports hidden.
    delete document.visibilityState;
  });
});

async function installLifecycleApp(page, { onTranscription } = {}) {
  await page.addInitScript(() => {
    window.__lifecycleCounts = { recorderStartCount: 0, recorderStopCount: 0, trackStopCount: 0 };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => {
        let stopped = false;
        const track = { stop() { if (!stopped) { stopped = true; window.__lifecycleCounts.trackStopCount += 1; } } };
        return { getTracks: () => [track] };
      } },
    });
    class LifecycleRecorder extends EventTarget {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/webm";
      start() { this.state = "recording"; window.__lifecycleCounts.recorderStartCount += 1; }
      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        window.__lifecycleCounts.recorderStopCount += 1;
        // Synthetic bytes exist only in this in-memory browser fixture.
        this.dispatchEvent(new BlobEvent("dataavailable", { data: new Blob([new Uint8Array(64)], { type: "audio/webm" }) }));
        this.dispatchEvent(new Event("stop"));
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: LifecycleRecorder });
    window.__lifecycleVisibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__lifecycleVisibility });
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/auth/me" && method === "GET") return json(route, account);
    if (path === "/api/topics" && method === "GET") return json(route, [topic]);
    if (path === "/api/review-phrases/summary" && method === "GET") return json(route, { phrase_count: 0 });
    if (path === "/api/sessions/start" && method === "POST") return json(route, { session, exercise });
    if (path === "/api/transcriptions" && method === "POST") {
      await onTranscription?.(route);
      if (!onTranscription) return json(route, { text: "Želim da otvorim račun." });
      return;
    }
    if (path === "/api/sessions/session-lifecycle/next-exercise" && method === "POST") {
      return json(route, { ...exercise, id: "exercise-lifecycle-next", source_ru: "Мы можем поговорить завтра." });
    }
    throw new Error(`Unexpected mocked API request: ${method} ${path}`);
  });

  await page.goto("/privacy");
  await page.evaluate(() => localStorage.setItem("sb-e2e-auth-auth-token", JSON.stringify({
    access_token: "e2e-lifecycle-only", refresh_token: "e2e-lifecycle-only", token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365, expires_at: 4102444800,
    user: { id: "user-lifecycle", aud: "authenticated", role: "authenticated", email: "learner@example.invalid",
      app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T10:00:00Z" },
  })));
  await page.goto("/?perf=1");
  await page.getByRole("button", { name: /В банке/ }).first().click();
  await expect(page.locator(".practice-stage .interactive-phrase")).toBeVisible();
}

async function transcribe(page) {
  await page.getByRole("button", { name: "Ответить голосом" }).click();
  await page.getByRole("button", { name: "Завершить запись" }).click();
  await expect(page.getByLabel("Ваш ответ")).toHaveValue("Želim da otvorim račun.");
}

async function setVisibility(page, state) {
  await page.evaluate((nextState) => {
    window.__lifecycleVisibility = nextState;
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test("background during recording releases media once, preserves draft, and resumes safely", async ({ page }) => {
  let transcriptionCount = 0;
  await installLifecycleApp(page, { onTranscription: async (route) => { transcriptionCount += 1; await json(route, { text: "Želim da otvorim račun." }); } });
  await transcribe(page);
  const draft = "Sačuvaj ovaj odgovor.";
  await page.getByLabel("Ваш ответ").fill(draft);

  await page.getByRole("button", { name: "Ответить голосом" }).click();
  await expect(page.getByRole("button", { name: "Завершить запись" })).toBeVisible();
  const beforeBackground = await page.evaluate(() => ({ ...window.__lifecycleCounts }));
  await setVisibility(page, "hidden");
  await setVisibility(page, "visible");
  await expect(page.getByRole("button", { name: "Ответить голосом" })).toBeVisible();
  await expect(page.getByLabel("Ваш ответ")).toHaveValue(draft);
  const afterResume = await page.evaluate(() => ({ ...window.__lifecycleCounts }));
  expect(afterResume.recorderStopCount - beforeBackground.recorderStopCount).toBe(1);
  expect(afterResume.trackStopCount - beforeBackground.trackStopCount).toBe(1);
  expect(transcriptionCount).toBe(1);

  await transcribe(page);
  expect(transcriptionCount).toBe(2);
  const afterRetry = await page.evaluate(() => ({ ...window.__lifecycleCounts }));
  expect(afterRetry.trackStopCount).toBe(afterResume.trackStopCount + 1);
});

test("late transcription after background cannot replace the existing draft", async ({ page }) => {
  let transcriptionCount = 0;
  let releaseLateResponse;
  let settleLateRoute;
  const lateResponse = new Promise((resolve) => { releaseLateResponse = resolve; });
  const lateRouteSettled = new Promise((resolve) => { settleLateRoute = resolve; });
  await installLifecycleApp(page, { onTranscription: async (route) => {
    transcriptionCount += 1;
    if (transcriptionCount === 1) return json(route, { text: "Želim da otvorim račun." });
    await lateResponse;
    try { await json(route, { text: "СТАРЫЙ РЕЗУЛЬТАТ НЕ ДОЛЖЕН ПОЯВИТЬСЯ" }); }
    catch { /* The app may cancel the request when it backgrounds. */ }
    finally { settleLateRoute(); }
  } });
  await transcribe(page);
  const draft = "Sačuvaj ovaj odgovor.";
  await page.getByLabel("Ваш ответ").fill(draft);
  await page.getByRole("button", { name: "Ответить голосом" }).click();
  await page.getByRole("button", { name: "Завершить запись" }).click();
  await expect(page.locator(".voice-status")).toContainText("Расшифровываем");

  await setVisibility(page, "hidden");
  await setVisibility(page, "visible");
  releaseLateResponse();
  await lateRouteSettled;
  await expect(page.getByLabel("Ваш ответ")).toHaveValue(draft);
  await expect(page.getByRole("button", { name: "Ответить голосом" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Запись прервана. Текущая фраза и текст ответа сохранены.");
  await expect(page.getByLabel("Ваш ответ")).not.toHaveValue("СТАРЫЙ РЕЗУЛЬТАТ НЕ ДОЛЖЕН ПОЯВИТЬСЯ");
  expect(transcriptionCount).toBe(2);
});

async function json(route, value) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
}
