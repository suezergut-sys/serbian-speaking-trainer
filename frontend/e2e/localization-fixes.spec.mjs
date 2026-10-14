import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { installSyntheticMicrophone } from './flow.mjs';
for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'android']) {
  test(`review completion and transcript ${language} ${layout}`, async ({ page }) => {
    const en = language === 'en';
    await page.setViewportSize(layout === 'desktop' ? { width: 1366, height: 900 } : { width: 393, height: 851 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await installSyntheticMicrophone(page);
    await page.addInitScript(lang => {
      localStorage.setItem('serbotalk.interface-language', lang);
      localStorage.setItem('sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, language);
    const topic = { id: 'bank', title_ru: 'В банке', description_ru: 'Счёт и платежи', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] };
    const daily_usage = { used: 0, limit: 10, remaining: 10, resets_at: '2026-10-15T00:00:00Z' };
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body, status = 200;
      if (path === '/api/auth/me') body = { id: 'user-1', role: 'user', access_tier: 'free', email: 'learner@example.invalid', daily_usage };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [topic];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 1 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', topic: { ...topic, id: 'review-phrases', title_ru: 'Фразы для повторения', source: 'preset' }, status: 'active', requested_length: 10, completed_count: 0 }, exercise: { id: 'e1', session_id: 's1', source_ru: 'Я хочу открыть новый текущий счёт.', word_hints: [], targeted_skills: [], expected_level: 'A2', difficulty: 1 } };
      else if (path.endsWith('/next-exercise')) { status = 409; body = { detail: { code: 'review_queue_empty', message: 'No active review phrases' } }; }
      else if (path === '/api/transcriptions') body = { text: 'Želim da otvorim račun.' };
      else if (path === '/api/attempts') body = { id: 'a1', exercise_id: 'e1', transcript_sr: 'Želim da otvorim račun.', overall_score: 1, base_score: 1, hint_penalty: 0, daily_usage, analysis: { verdict: 'correct', corrected_sr: 'Želim da otvorim račun.', short_feedback_ru: en ? 'Correct.' : 'Верно.', detailed_feedback_ru: en ? 'Correct.' : 'Верно.', issues: [], demonstrated_skills: [] } };
      else throw new Error(`Unexpected path: ${path}`);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/');
    if (layout !== 'desktop') await page.getByRole('button', { name: en ? 'Topics' : 'Темы', exact: true }).click();
    await page.locator(layout === 'desktop' ? '.review-topic' : '.android-topic-list > button').first().click();
    await page.getByRole('button', { name: en ? 'Answer aloud' : 'Ответить голосом', exact: true }).click();
    await page.getByRole('button', { name: en ? 'Finish recording' : 'Завершить запись', exact: true }).click();
    const answer = page.getByLabel(en ? 'Your answer' : 'Ваш ответ', { exact: true });
    await expect(answer).toHaveValue('Želim da otvorim račun.');
    const phrase = page.locator('.interactive-phrase:visible');
    expect(await answer.evaluate(el => getComputedStyle(el).fontSize)).toBe(await phrase.evaluate(el => getComputedStyle(el).fontSize));
    const box = await answer.boundingBox();
    expect(box.y + box.height / 2).toBeLessThan(851 * .8);
    await mkdir('../artifacts/localization-fixes', { recursive: true });
    await page.screenshot({ path: `../artifacts/localization-fixes/${language}-${layout}-transcript.png` });
    await page.getByRole('button', { name: en ? (layout === 'android' ? 'Check' : 'Check answer') : (layout === 'android' ? 'Проверить' : 'Проверить ответ'), exact: true }).click();
    await page.getByRole('button', { name: en ? (layout === 'desktop' ? 'Next phrase' : 'Next') : (layout === 'desktop' ? 'Следующая фраза' : 'Следующая') }).click();
    const congratulations = page.locator('.review-congratulations:visible');
    await expect(congratulations).toHaveCSS('color', 'rgb(255, 255, 255)');
    expect(parseFloat(await congratulations.evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
    await page.screenshot({ path: `../artifacts/localization-fixes/${language}-${layout}-complete.png` });
    await page.locator('.review-complete:visible').getByRole('button', { name: en ? 'Choose topic' : 'Выбрать тему' }).click();
    await expect(page.getByRole('button', { name: en ? /At the bank/ : /В банке/ }).first()).toBeVisible();
    await expect(page.locator('.topic.is-selected, .android-topic.is-selected')).toHaveCount(0);
  });
}
for (const layout of ['desktop', 'mobile', 'android']) {
  test(`login language ${layout}`, async ({ page }) => {
    await page.setViewportSize(layout === 'desktop' ? { width: 1366, height: 900 } : { width: 393, height: 851 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Добро пожаловать в SerboTalk' })).toBeVisible();
    await page.getByRole('button', { name: 'Изменить язык' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to SerboTalk' })).toBeVisible();
    await page.getByText('Review access', { exact: true }).click();
    await expect(page.getByLabel('Username or email', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await page.screenshot({ path: `../artifacts/localization-fixes/en-${layout}-login.png` });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome to SerboTalk' })).toBeVisible();
    await page.getByRole('button', { name: 'Change language' }).click();
    await page.getByText('Вход для проверки / Review access', { exact: true }).click();
    await expect(page.getByLabel('Пароль', { exact: true })).toBeVisible();
    await page.screenshot({ path: `../artifacts/localization-fixes/ru-${layout}-login.png` });
  });
}
