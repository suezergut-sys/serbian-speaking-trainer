import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { installSyntheticMicrophone } from './flow.mjs';
for (const language of ['ru', 'en']) for (const layout of ['desktop', 'wide', 'tablet', 'mobile', 'narrow', 'short', 'landscape', 'android', 'android-narrow', 'android-landscape']) {
  test(`local success rewards ${language} ${layout}`, async ({ page }) => {
    const en = language === 'en';
    await page.setViewportSize(layout === 'wide' ? { width: 1920, height: 1080 } : layout === 'tablet' ? { width: 800, height: 1024 } : layout.endsWith('landscape') ? { width: 851, height: 393 } : layout === 'desktop' ? { width: 1366, height: 900 } : layout.endsWith('narrow') ? { width: 320, height: 568 } : layout === 'short' ? { width: 393, height: 480 } : { width: 393, height: 851 });
    if (layout.startsWith('android')) await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await installSyntheticMicrophone(page);
    await page.addInitScript(() => {
      window.__rewardSounds = 0;
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function(...args) { window.__rewardSounds += 1; return original.apply(this, args); };
    });
    await page.addInitScript(storageKey => { window.__practiceStorageKey = storageKey; }, process.env.PRACTICE_AUTH_STORAGE_KEY);
    await page.addInitScript(lang => {
      localStorage.setItem('serbotalk.interface-language', lang);
      localStorage.setItem(window.__practiceStorageKey || 'sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, language);
    const topic = { id: 'bank', title_ru: 'В банке', description_ru: 'Счёт и платежи', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] };
    const verdict = 'correct';
    const daily_usage = { used: 18, limit: 20, remaining: 2, resets_at: '2026-10-15T00:00:00Z' };
    let attemptCount = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body, status = 200;
      if (path === '/api/auth/me') body = { id: 'user-1', role: 'user', access_tier: 'free', email: 'learner@example.invalid', daily_usage };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [topic];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 1 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', topic: { ...topic, id: 'review-phrases', title_ru: 'Фразы для повторения', source: 'preset' }, status: 'active', requested_length: 10, completed_count: 0 }, exercise: { id: 'e1', session_id: 's1', source_ru: 'Я хочу открыть новый текущий счёт.', word_hints: [{ word_ru: 'хочу', translation_sr: 'želim' }], targeted_skills: [], expected_level: 'A2', difficulty: 1 } };
      else if (path.endsWith('/next-exercise')) { status = 409; body = { detail: { code: 'review_queue_empty', message: 'No active review phrases' } }; }
      else if (path.endsWith('/word-hints')) body = { word_ru: route.request().postDataJSON().word, translation_sr: 'želim', learning_status: 'learning', correct_streak: 0 };
      else if (path === '/api/transcriptions') body = { text: 'Želim da otvorim račun.' };
      else if (path === '/api/attempts') body = { daily_usage: { ...daily_usage, used: ++attemptCount <= 2 ? 19 : 20, remaining: 0 }, id: `a${attemptCount}`, first_success_today: attemptCount === 1, exercise_id: 'e1', transcript_sr: 'Želim da otvorim račun.', overall_score: verdict === 'needs_work' ? .62 : verdict === 'mostly_correct' ? .91 : 1, base_score: 1, hint_penalty: 0, analysis: { verdict, corrected_sr: 'Želim da otvorim račun.', short_feedback_ru: verdict === 'needs_work' ? (en ? 'Try again.' : 'Попробуйте ещё раз.') : verdict === 'mostly_correct' ? (en ? 'Almost correct.' : 'Почти верно.') : (en ? 'Correct.' : 'Верно.'), detailed_feedback_ru: en ? 'Correct.' : 'Верно.', issues: [], demonstrated_skills: [] } };
      else throw new Error(`Unexpected path: ${path}`);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(process.env.REWARDS_APP_PATH ?? '/');
    async function check() {
      await page.getByRole('button', { name: en ? 'Answer aloud' : 'Ответить голосом', exact: true }).click();
      await page.getByRole('button', { name: en ? 'Finish recording' : 'Завершить запись', exact: true }).click();
      await page.getByRole('button', { name: en ? (layout.startsWith('android') ? 'Check' : 'Check answer') : (layout.startsWith('android') ? 'Проверить' : 'Проверить ответ'), exact: true }).click();
    }
    const panel = page.locator('.reward-panel');
    for (const kind of ['start', 'perfect', 'twenty']) {
      await check();
      await expect(panel).toHaveText(kind === 'start' ? (en ? 'Successful start!' : 'Успешный старт!') : kind === 'perfect' ? (en ? '100%Correct' : '100%Верно') : (en ? '2020 repetitions today!' : '2020 повторений за день!'));
      await expect(page.locator('.feedback__score')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.__rewardSounds)).toBe(1);
      const anchor = kind === 'twenty' ? { x: 0, y: 0, ...page.viewportSize() } : await page.locator('.exercise-layout:visible').boundingBox();
      const bounds = await panel.boundingBox();
      expect(Math.abs(bounds.x + bounds.width / 2 - anchor.x - anchor.width / 2)).toBeLessThan(2);
      expect(Math.abs(bounds.y + bounds.height / 2 - anchor.y - anchor.height / 2)).toBeLessThan(2);
      await page.waitForTimeout(450);
      const settled = await panel.boundingBox();
      expect(Math.abs(settled.width - settled.height)).toBeLessThan(1);
      const desired = kind === 'twenty' ? 366.85 : 215.05;
      const expectedSize = Math.min(desired, anchor.width - 24, anchor.height - 24);
      expect(Math.abs(settled.width - expectedSize)).toBeLessThan(1);
      expect(settled.x).toBeGreaterThanOrEqual(anchor.x);
      expect(settled.y).toBeGreaterThanOrEqual(anchor.y);
      expect(settled.x + settled.width).toBeLessThanOrEqual(anchor.x + anchor.width + 1);
      expect(settled.y + settled.height).toBeLessThanOrEqual(anchor.y + anchor.height + 1);
      const contentFits = await panel.evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight);
      expect(contentFits).toBe(true);
      const medal = await page.locator('.reward-medal').boundingBox();
      expect(Math.abs(medal.width - medal.height)).toBeLessThan(1);
      await mkdir('../artifacts/square-success-rewards', { recursive: true });
      await page.screenshot({ path: `../artifacts/square-success-rewards/${language}-${layout}-${kind}.png` });
      await expect(panel).toHaveCount(0, { timeout: 2500 });
      await expect(page.locator('.feedback__score')).toHaveCount(0);
      await page.reload();
      if (layout.startsWith('android')) await page.getByRole('button', { name: en ? 'Practice' : 'Тренировка', exact: true }).click();
    }
    expect(requests.some(url => /\.(wav|mp3|ogg)(\?|$)/.test(url))).toBe(false);
    await page.getByRole('button', { name: en ? 'Settings' : 'Настройки', exact: true }).click();
    await page.getByRole('switch', { name: en ? 'Success sounds' : 'Звуки успеха' }).uncheck();
    await page.getByRole('switch', { name: en ? 'Success animations' : 'Анимации успеха' }).uncheck();
    await page.reload();
    if (layout.startsWith('android')) await page.getByRole('button', { name: en ? 'Practice' : 'Тренировка', exact: true }).click();
    await check();
    await expect(page.locator('.feedback:visible')).toBeVisible();
    await expect(panel).toHaveCount(0);
    await expect(page.locator('.feedback__score')).toHaveCount(0);
    expect(await page.evaluate(() => window.__rewardSounds)).toBe(0);
  });
}
