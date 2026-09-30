import { expect, test } from "@playwright/test";
import { captureMetrics } from "./metrics.mjs";
import { installSyntheticMicrophone, runPracticeFlow } from "./flow.mjs";

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
  expected_level: "A2", difficulty: 1, word_hints: [{ word_ru: "хочу", translation_sr: "želim" }],
});
const account = {
  id: "user-1", email: "learner@example.invalid", display_name: "Ученик", avatar_url: null,
  role: "user", access_tier: "free", registered_at: "2026-09-01T10:00:00Z",
  last_active_at: "2026-09-29T10:00:00Z",
  daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: "2026-09-30T00:00:00Z" },
};

async function mockApp(page, submitted) {
  await installSyntheticMicrophone(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    const method = request.method();
    let body;
    if (path === "/api/auth/me" && method === "GET") body = account;
    else if (path === "/api/topics" && method === "GET") body = [topic];
    else if (path === "/api/review-phrases/summary" && method === "GET") body = { phrase_count: 0 };
    else if (path === "/api/sessions/start" && method === "POST") body = { session, exercise: exercise("exercise-1", "Я хочу открыть счёт.") };
    else if (path === "/api/transcriptions" && method === "POST") body = { text: "Želim da otvorim račun." };
    else if (path === "/api/attempts" && method === "POST") {
      submitted.push(request.postDataJSON().transcript_sr);
      body = {
        id: "attempt-1", exercise_id: "exercise-1", transcript_sr: submitted.at(-1), overall_score: 0.96,
        base_score: 0.96, hint_penalty: 0, daily_usage: account.daily_usage,
        analysis: { verdict: "correct", semantic_score: 0.96, grammar_score: 0.96,
          lexical_score: 0.96, naturalness_score: 0.96, pronunciation_score: null,
          fluency_score: 1, corrected_sr: "Želim da otvorim račun.",
          short_feedback_ru: "Верный перевод.", detailed_feedback_ru: "Верный перевод.",
          accepted_alternatives: [], issues: [], demonstrated_skills: [] },
      };
    }
    else if (path === "/api/sessions/session-1/next-exercise" && method === "POST") body = exercise("exercise-2", "Мы можем поговорить завтра.");
    if (body === undefined) throw new Error(`Unexpected mocked API request: ${method} ${path}`);
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
}

const measuredSamples = Number(process.env.E2E_SAMPLES_PER_SCRIPT ?? 1);
const warmups = Number(process.env.E2E_WARMUP_PER_SCRIPT ?? 0);
if (!Number.isInteger(measuredSamples) || measuredSamples < 1 || measuredSamples > 30 ||
    !Number.isInteger(warmups) || warmups < 0 || warmups > 5) {
  throw new Error("E2E_SAMPLES_PER_SCRIPT must be 1..30 and E2E_WARMUP_PER_SCRIPT 0..5");
}

for (const { label, typed, normalized } of [
  { label: "latin", typed: "Želim da otvorim račun.", normalized: "Želim da otvorim račun." },
  { label: "cyrillic", typed: "Желим да отворим рачун.", normalized: "Želim da otvorim račun." },
  { label: "mixed", typed: "Žеlim da otvorim račun.", normalized: "Želim da otvorim račun." },
]) {
  for (let sample = -warmups; sample < measuredSamples; sample += 1) {
    test(`mocked complete practice flow: ${label} ${sample < 0 ? `warmup ${-sample}` : `sample ${sample + 1}`}`, async ({ page }) => {
      const submitted = [];
      await mockApp(page, submitted);
      const saveMetrics = captureMetrics(page);
      await page.goto("/?perf=1");
      await runPracticeFlow(page, { topic: /В банке/, transcript: typed, firstPhrase: "Я хочу открыть счёт.", expectedScore: "96%" });
      expect(submitted).toEqual([normalized]);
      if (sample >= 0) await saveMetrics(`mock-${label}-${sample + 1}`);
    });
  }
}
