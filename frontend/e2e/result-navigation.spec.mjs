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

for (const native of [false, true]) {
  test(`${native ? 'Android layout' : 'web'} narrows phrase evidence to the incorrect word${native ? ' and home opens topics preserving draft' : ''}`, async ({ page }) => {
    if (native) {
      await page.setViewportSize({ width: 393, height: 851 });
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
      else if (path === '/api/attempts') body = { id: 'attempt-result', exercise_id: exercise.id, transcript_sr: transcript, overall_score: 0.88, base_score: 0.88, hint_penalty: 0, daily_usage: account.daily_usage,
        analysis: { verdict: 'needs_work', semantic_score: 1, grammar_score: 0.88, lexical_score: 0.88, naturalness_score: 0.88, pronunciation_score: null, fluency_score: 1,
          corrected_sr: corrected, short_feedback_ru: 'Исправьте слово.', detailed_feedback_ru: 'Исправьте слово.', accepted_alternatives: [], demonstrated_skills: [],
          issues: [{ type: 'grammar', skill_key: 'adjectives', severity: 0.5, confidence: 1, evidence: 'jutreneg prevoza', correction: 'jutarnjeg prevoza' }] } };
      else if (path === `/api/sessions/${session.id}/next-exercise`) body = { ...exercise, id: 'exercise-next', source_ru: 'Мы придём завтра.' };
      else throw new Error(`Unexpected fixture route: ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/privacy');
    await page.evaluate(() => {
      localStorage.setItem('sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_in: 31536000, expires_at: 4102444800,
        user: { id: 'result-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' } }));
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Транспорт/ }).first().click();
    await page.getByRole('button', { name: 'Ответить голосом', exact: true }).click();
    await page.getByRole('button', { name: 'Завершить запись', exact: true }).click();
    await expect(page.getByLabel('Ваш ответ')).toHaveValue(transcript);
    if (native) {
      await page.getByRole('button', { name: 'Темы', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Темы', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('region', { name: 'Выбор темы' })).toBeInViewport();
      await expect(page.locator('.practice-topic-chooser')).toHaveCount(0);
      await page.getByRole('button', { name: 'Тренировка', exact: true }).click();
      await expect(page.getByLabel('Ваш ответ')).toHaveValue(transcript);
      expect(starts).toBe(1);
    }
    await page.getByRole('button', { name: native ? 'Проверить' : 'Проверить ответ', exact: true }).click();
    const userAnswer = page.getByText('Ваш вариант', { exact: true }).locator('..');
    await expect(userAnswer.locator('mark')).toHaveCount(1);
    await expect(userAnswer.locator('mark')).toHaveText('jutreneg');
    await expect(userAnswer).toHaveText(`Ваш вариант${transcript}`);
  });
}
