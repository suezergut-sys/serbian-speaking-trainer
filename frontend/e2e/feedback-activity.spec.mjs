import { expect, test } from '@playwright/test';
import { installSyntheticMicrophone } from './flow.mjs';

const bank = { id: 'bank', title_ru: 'Банк', description_ru: '', likely_intents: [], suggested_vocabulary: [], is_custom: false, phrase_count: 20 };
const review = { ...bank, id: 'review-phrases', title_ru: 'Фразы для повторения' };
const account = { id: 'feedback-user', email: 'learner@example.invalid', display_name: 'Learner', role: 'user', access_tier: 'free',
  assistance_enabled: false, can_debug_models: false, daily_usage: { used: 0, limit: 20, remaining: 20, resets_at: '2026-10-18T00:00:00Z' } };

for (const layout of ['desktop', 'mobile', 'android']) for (const language of ['ru', 'en']) {
  test(`${layout} ${language}: review origin, centered loading, voice feedback`, async ({ page }) => {
    const en = language === 'en';
    if (layout !== 'desktop') await page.setViewportSize({ width: 393, height: 852 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await installSyntheticMicrophone(page);
    let releaseStart;
    let submitted;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/auth/me') body = account;
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [bank];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 1 };
      else if (path === '/api/sessions/start') {
        const input = route.request().postDataJSON();
        if (input.topic_id === 'bank') await new Promise(resolve => { releaseStart = resolve; });
        body = { session: { id: 'session-test', status: 'active', level: 'A2', requested_length: 10, completed_count: 0, topic: { ...(input.review_mode ? review : bank), source: 'preset' } },
          exercise: { id: 'phrase-test', session_id: 'session-test', source_ru: 'Я хочу открыть новый текущий счёт.', topic_id: 'bank', topic_title_ru: 'Банк', targeted_skills: [], difficulty: .5, expected_level: 'A2', word_hints: [] } };
      } else if (path === '/api/feedback/transcribe') body = { text: en ? 'Please add more topics.' : 'Добавьте ещё темы.' };
      else if (path === '/api/feedback') { submitted = route.request().postDataJSON(); body = { id: 'feedback-test', created_at: '2026-10-17T12:00:00Z' }; }
      else throw new Error(`Unexpected route ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/privacy');
    await page.evaluate(({ language, storageKey }) => {
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_in: 31536000, expires_at: 4102444800,
        user: { id: 'feedback-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' } }));
    }, { language, storageKey: process.env.FEEDBACK_AUTH_STORAGE_KEY ?? "sb-e2e-auth-auth-token" });
    await page.goto(process.env.FEEDBACK_APP_PATH ?? '/');
    if (layout !== 'desktop') await page.getByRole('button', { name: en ? 'Practice' : 'Тренировка', exact: true }).click();
    await expect(page.getByText(en ? 'Review phrases / Bank' : 'Фразы для повторения / Банк', { exact: true }).first()).toBeVisible();

    if (layout === 'desktop') {
      await page.getByRole('button', { name: /^(Банк|Bank)/ }).click();
      const loader = page.getByRole('status', { name: en ? 'Preparing phrase' : 'Подготовка фразы' });
      await expect(loader).toBeVisible();
      const panelBox = await page.locator('.practice-stage').boundingBox();
      const loaderBox = await loader.boundingBox();
      expect(Math.abs(loaderBox.x + loaderBox.width / 2 - panelBox.x - panelBox.width / 2)).toBeLessThan(2);
      expect(Math.abs(loaderBox.y + loaderBox.height / 2 - panelBox.y - panelBox.height / 2)).toBeLessThan(2);
      await expect.poll(() => Boolean(releaseStart)).toBe(true);
      releaseStart();
      await expect(loader).toHaveCount(0);
    }
    await page.getByRole('button', { name: en ? 'Settings' : 'Настройки', exact: true }).click();
    await page.getByRole('button', { name: en ? 'Write or record feedback' : 'Написать или записать отзыв' }).click();
    await page.getByRole('button', { name: en ? 'Record feedback' : 'Записать голосом', exact: true }).click();
    await page.getByRole('button', { name: en ? 'Finish recording' : 'Завершить запись', exact: true }).click();
    const textbox = page.getByRole('textbox', { name: en ? 'Your feedback' : 'Ваша обратная связь' });
    await expect(textbox).toHaveValue(en ? 'Please add more topics.' : 'Добавьте ещё темы.');
    await textbox.fill(en ? 'Edited feedback.' : 'Исправленный отзыв.');
    await page.locator(".feedback-settings").screenshot({ path: `test-results/feedback-${layout}-${language}.png` });
    await page.getByRole('button', { name: en ? 'Send feedback' : 'Отправить обратную связь' }).click();
    await expect(page.getByText(en ? 'Thank you! Your feedback has been sent.' : 'Спасибо! Обратная связь отправлена.')).toBeVisible();
    expect(submitted).toEqual({ content: en ? 'Edited feedback.' : 'Исправленный отзыв.' });
  });
}
