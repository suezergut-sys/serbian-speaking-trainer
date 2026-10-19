import { expect, test } from '@playwright/test';
import { installSyntheticMicrophone } from './flow.mjs';

const transcript = 'Malo ćemo kasniti zbog jutreneg prevoza.';
const corrected = 'Malo ćemo kasniti zbog jutarnjeg prevoza.';
const topic = { id: 'transport', title_ru: 'Транспорт', description_ru: '', likely_intents: [], suggested_vocabulary: [], is_custom: false, phrase_count: 2 };
const session = { id: 'session-result', status: 'active', level: 'A2', started_at: '2026-10-01T09:00:00Z', requested_length: 10, completed_count: 0,
  topic: { ...topic, source: 'preset', target_level: 'A2', excluded_domains: [], normalized_prompt_context: '' } };
const exercise = { id: 'exercise-result', session_id: session.id, source_ru: 'Мы немного опоздаем из-за утреннего транспорта.', targeted_skills: [], expected_level: 'A2', difficulty: 1, word_hints: [] };
const account = { id: 'result-user', email: 'learner@example.invalid', display_name: 'Ученик', avatar_url: null, role: 'user', access_tier: 'free',
  registered_at: '2026-09-01T00:00:00Z', last_active_at: '2026-10-01T09:00:00Z', daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: '2026-10-02T00:00:00Z' } };

for (const layout of ['desktop', 'mobile', 'android']) for (const language of ['ru', 'en']) for (const verdict of ['correct', 'mostly_correct', 'needs_work']) {
  const native = layout === 'android';
  const en = language === 'en';
  const score = verdict === 'correct' ? 1 : 0.88;
  test(`${layout} ${language} ${verdict}: compact result and next phrase`, async ({ page }) => {
    if (layout !== 'desktop') await page.setViewportSize({ width: 393, height: 720 });
    if (native) {
      // Browser rendering of native layout; this does not claim an APK/native bridge test.
      await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    }
    await installSyntheticMicrophone(page);
    let starts = 0;
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/auth/me') body = account;
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [topic];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/sessions/start') { starts += 1; body = { session, exercise }; }
      else if (path === '/api/transcriptions') body = { text: transcript };
      else if (path === '/api/attempts') body = { id: 'attempt-result', exercise_id: exercise.id, transcript_sr: transcript, overall_score: score, base_score: score, hint_penalty: 0, daily_usage: account.daily_usage,
        analysis: { verdict, semantic_score: 1, grammar_score: 0.88, lexical_score: 0.88, naturalness_score: 0.88, pronunciation_score: null, fluency_score: 1,
          corrected_sr: corrected, short_feedback_ru: 'Исправьте слово.', detailed_feedback_ru: 'Исправьте слово.', accepted_alternatives: [], demonstrated_skills: [],
          issues: [{ type: 'grammar', skill_key: 'adjectives', severity: 0.5, confidence: 1, evidence: 'jutreneg prevoza', correction: 'jutarnjeg prevoza' }] } };
      else if (path === `/api/sessions/${session.id}/next-exercise`) body = { ...exercise, id: 'exercise-next', source_ru: 'Мы придём завтра.' };
      else throw new Error(`Unexpected fixture route: ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/privacy');
    await page.evaluate(({ language, storageKey }) => {
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_in: 31536000, expires_at: 4102444800,
        user: { id: 'result-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' } }));
    }, { language, storageKey: process.env.RESULT_AUTH_STORAGE_KEY ?? "sb-e2e-auth-auth-token" });
    await page.goto('/');
    if (layout !== 'desktop') await page.getByRole('button', { name: en ? 'Topics' : 'Темы', exact: true }).click();
    await page.getByRole('button', { name: en ? /Transport/ : /Транспорт/ }).first().click();
    await page.getByRole('button', { name: en ? 'Answer aloud' : 'Ответить голосом', exact: true }).click();
    await page.getByRole('button', { name: en ? 'Finish recording' : 'Завершить запись', exact: true }).click();
    await expect(page.getByLabel(en ? 'Your answer' : 'Ваш ответ')).toHaveValue(transcript);
    if (native) {
      await page.getByRole('button', { name: en ? 'Topics' : 'Темы', exact: true }).click();
      await expect(page.getByRole('button', { name: en ? 'Topics' : 'Темы', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('region', { name: en ? 'Choose a topic' : 'Выбор темы' })).toBeInViewport();
      await expect(page.locator('.practice-topic-chooser')).toHaveCount(0);
      await page.getByRole('button', { name: en ? 'Practice' : 'Тренировка', exact: true }).click();
      await expect(page.getByLabel(en ? 'Your answer' : 'Ваш ответ')).toHaveValue(transcript);
      expect(starts).toBe(1);
    }
    await page.getByRole('button', { name: native ? (en ? 'Check' : 'Проверить') : (en ? 'Check answer' : 'Проверить ответ'), exact: true }).click();
    const userAnswer = page.getByText(en ? 'Your answer' : 'Ваш вариант', { exact: true }).locator('..');
    await expect(userAnswer.locator('mark')).toHaveCount(verdict === 'correct' ? 0 : 1);
    if (verdict !== 'correct') await expect(userAnswer.locator('mark')).toHaveText('jutreneg');
    await expect(userAnswer).toHaveText(`${en ? 'Your answer' : 'Ваш вариант'}${transcript}`);
    await expect(page.locator('#exercise-title')).toHaveCount(0);
    await expect(page.locator('.result-phrase')).toHaveCount(2);
    await expect(page.getByText(exercise.source_ru, { exact: true })).toHaveCount(0);
    await expect(page.locator('.feedback > p')).toHaveCount(0);
    if (score === 1) await expect(page.locator('.feedback__score')).toHaveCount(0);
    else {
      await expect(page.locator('.feedback__score')).toContainText(`${Math.round(score * 100)}%`);
      if (layout !== 'desktop') await expect(page.locator('.feedback__score')).toBeInViewport({ ratio: 1 });
    }
    const next = page.getByRole('button', { name: layout !== 'desktop' ? (en ? 'Next' : 'Следующая') : (en ? 'Next phrase' : 'Следующая фраза'), exact: true });
    await expect(next).toBeInViewport({ ratio: 1 });
    await next.click();
    await expect(page.locator('#exercise-title')).toBeVisible();
    await expect(page.locator('.feedback')).toHaveCount(0);
  });
}
