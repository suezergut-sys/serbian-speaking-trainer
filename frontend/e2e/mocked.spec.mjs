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
for (const native of [false, true]) {
  test(`${native ? "Android layout" : "web"} dynamic transcription analysis and unavailable fallback`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    if (native) await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: "android" }; });
    await mockApp(page, []);
    await page.evaluate(() => localStorage.setItem("serbotalk.soft-assistance.user-1", "true"));
    let recordings = 0;
    await page.route("**/api/transcriptions", route => {
      const body = ++recordings === 1 ? {
        text: "🙂 Zelim platitti racun i secer.", raw_text: "🙂 Zelim platitti racun i secer.",
        transcription_id: "receipt-dynamic", assistance_status: "analyzed", changes: [
          [2, 7, "Zelim", "Želim"], [8, 16, "platitti", "platiti"],
          [17, 22, "racun", "račun"], [25, 30, "secer", "šećer"],
        ].map(([start, end, original, replacement]) => ({ start, end, original, replacement,
          kind: "phonetic_ambiguity", action: "suggested", reason_code: "confirm_ambiguous_sound",
          explanation_ru: "Возможно искажение близких звуков или написания при распознавании.",
        })),
      } : { text: "Moj odgovor.", raw_text: "Moj odgovor.", assistance_status: "unavailable" };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("/");
    await page.getByRole("heading", { name: "Я хочу открыть счёт." }).waitFor();
    await page.getByRole("button", { name: "Ответить голосом" }).click();
    await page.getByRole("button", { name: "Завершить запись" }).click();
    await expect(page.getByRole("button", { name: "Принять подсказку" })).toHaveCount(4);
    const section = page.getByRole("region", { name: "Мягкие подсказки" });
    const style = await section.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    expect(style.background).toBe("rgb(7, 22, 42)");
    expect(style.color).toBe("rgb(184, 213, 244)");
    const box = await section.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(394);
    await page.getByRole("button", { name: "Принять подсказку" }).last().click();
    await expect(page.getByLabel("Ваш ответ")).toHaveValue("🙂 Zelim platitti racun i šećer.");
    await page.getByRole("button", { name: "Отменить" }).click();
    await expect(page.getByLabel("Ваш ответ")).toHaveValue("🙂 Zelim platitti racun i secer.");
    await page.getByRole("button", { name: "Записать заново" }).click();
    await page.getByRole("button", { name: "Завершить запись" }).click();
    await expect(page.getByText(/Мягкие подсказки временно недоступны/)).toBeVisible();
    await expect(page.getByLabel("Ваш ответ")).toHaveValue("Moj odgovor.");
    await expect(page.getByRole("button", { name: native ? "Проверить" : "Проверить ответ", exact: true })).toBeEnabled();
  });
}
for (const native of [false, true]) {
  test(`${native ? "Android" : "web"} opt-in assistance and artwork`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    if (native) await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: "android" }; });
    await mockApp(page, []);
    const payloads = [];
    page.on("request", r => { if (new URL(r.url()).pathname === "/api/attempts") payloads.push(r.postDataJSON()); });
    await page.route("**/api/transcriptions", r => r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({text:"Cemu?",raw_text:"Cemu?",transcription_id:"receipt-1",changes:[{start:0,end:4,original:"Cemu",replacement:"Čemu",action:"suggested",kind:"phonetic_ambiguity",reason_code:"confirm_ambiguous_sound"}]})}));
    await page.goto("/");
    await page.getByRole("heading", {name:"Я хочу открыть счёт."}).waitFor();
    await page.getByRole("button", {name:"Настройки",exact:true}).click();
    const toggle = page.getByRole("switch");
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await page.getByRole("button", {name:native ? "Тренировка" : "Практика",exact:true}).click();
    await page.getByRole("button", {name:"Ответить голосом"}).click();
    await page.getByRole("button", {name:"Завершить запись"}).click();
    const answer = page.getByLabel("Ваш ответ");
    await expect(answer).toHaveValue("Cemu?");
    await page.getByRole("button", {name:"Принять подсказку"}).click();
    await expect(answer).toHaveValue("Čemu?");
    await page.getByText("Исходная расшифровка", {exact:true}).click();
    await expect(page.getByText("Cemu?", {exact:true})).toBeVisible();
    const check = page.getByRole("button", {name:native ? "Проверить" : "Проверить ответ",exact:true});
    const retry = page.getByRole("button", {name:"Записать заново"});
    await expect(check).toHaveCSS("border-color", "rgb(87, 201, 255)");
    await expect(retry).toHaveCSS("border-color", "rgb(87, 201, 255)");
    await expect(check).toHaveCSS("color", "rgb(83, 255, 208)");
    await expect(retry).toHaveCSS("animation-name", "none");
    await page.screenshot({path:`../artifacts/soft-assistance-${native ? "android" : "web"}.png`});
    await check.click();
    await expect(page.getByText("Верный перевод.", {exact:true}).first()).toBeVisible();
    expect(payloads[0]).toMatchObject({transcription_id:"receipt-1",accepted_transcription_changes:[0],transcript_sr:"Čemu?"});
  });
}
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


for (const native of [false, true]) {
test(`${native ? "Android layout" : "web"} dark error recovery and transcript actions at phone width`, async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  if (native) await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: "android" }; });
  const submitted = [];
  await mockApp(page, submitted);
  let transcriptionCount = 0;
  await page.route("**/api/transcriptions", async route => {
    transcriptionCount++;
    await route.fulfill({ status: transcriptionCount === 1 ? 502 : 200, contentType: "application/json", body: JSON.stringify(transcriptionCount === 1 ? {detail: "unavailable"} : {text: "Želim da otvorim račun."}) });
  });
  await page.goto("/");
  await page.getByRole("heading", {name: "Я хочу открыть счёт."}).waitFor();
  await page.getByRole("button", {name: "Ответить голосом"}).click();
  await page.getByRole("button", {name: "Завершить запись"}).click();
  const manual = page.getByRole("button", {name: "Ввести ответ вручную"});
  await expect(manual).toBeVisible();
  const styles = await manual.evaluate(element => {
    const style = getComputedStyle(element);
    return {background: style.backgroundColor, color: style.color, font: style.fontFamily, bodyFont: getComputedStyle(document.body).fontFamily};
  });
  expect(styles.background).toBe("rgb(7, 22, 42)");
  expect(styles.color).toBe("rgb(220, 234, 255)");
  expect(styles.font).toBe(styles.bodyFont);
  await page.getByRole("button", {name: "Ответить голосом"}).click();
  await page.getByRole("button", {name: "Завершить запись"}).click();
  await expect(page.getByLabel("Ваш ответ")).toHaveValue("Želim da otvorim račun.");
  const check = page.getByRole("button", {name: native ? "Проверить" : "Проверить ответ", exact: true});
  const retry = page.getByRole("button", {name: "Записать заново"});
  await expect(check).toBeVisible();
  await expect(retry).toBeVisible();
  const checkBox = await check.boundingBox();
  const retryBox = await retry.boundingBox();
  const textBox = await page.getByLabel("Ваш ответ").boundingBox();
  expect(checkBox.x).toBeLessThan(retryBox.x);
  expect(checkBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height);
  expect(checkBox.width).toBe(checkBox.height);
  await expect(retry.locator(".mic-retry-ring")).toBeVisible();
  expect(await retry.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  expect(submitted).toHaveLength(0);
  await check.click();
  await expect(page.getByText("Верный перевод.", {exact: true}).first()).toBeVisible();
  expect(submitted).toHaveLength(1);
});

}
