import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const [native, width] of [[false, 320], [false, 390], [true, 393]]) {
  test(`topic cards, activity star and settings heading (${native ? 'native layout' : 'mobile web'} ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
    if (native) await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'cards-user', email: 'learner@example.invalid', display_name: 'Ученик', role: 'user', access_tier: 'free', registered_at: '2026-10-01T00:00:00Z', last_active_at: '2026-10-07T00:00:00Z', daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: '2026-10-08T00:00:00Z' } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [{ id: 'bank', title_ru: 'В банке', description_ru: 'Счёт и платежи', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] }];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/sessions/start') body = {
        session: { id: 'cards-session', status: 'active', level: 'A2', started_at: '2026-10-07T00:00:00Z', requested_length: 10, completed_count: 0, topic: { id: 'bank', title_ru: 'В банке', description_ru: 'Счёт', source: 'preset', target_level: 'A2', likely_intents: [], suggested_vocabulary: [], excluded_domains: [], normalized_prompt_context: 'Счёт' } },
        exercise: { id: 'cards-exercise', session_id: 'cards-session', source_ru: 'Я хочу открыть счёт.', targeted_skills: [], expected_level: 'A2', difficulty: 1, word_hints: [] },
      };
      else if (path === '/api/statistics/monthly') body = { month: '2026-10', active_days: 1, total_phrases: 1, total_translations: 20, correct_translations: 20, mastered_phrases: 0, days: [{ date: '2026-10-07', phrase_count: 1, translation_count: 20, correct_translation_count: 20, mastered_phrase_count: 0 }] };
      else throw new Error(`Unexpected fixture path: ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/privacy');
    await page.evaluate(() => localStorage.setItem('sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_in: 31536000, expires_at: 4102444800, user: { id: 'cards-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } })));
    await page.goto('/');
    await page.getByRole('button', { name: 'Темы', exact: true }).click();
    const topic = page.getByRole('button', { name: /добавить тему/ });
    const phrase = page.getByRole('button', { name: /добавить фразу/ });
    await expect(topic).toBeDisabled();
    await expect(topic.locator('strong')).toHaveCSS('white-space', 'normal');
    await expect(phrase.locator('strong')).toHaveCSS('white-space', 'normal');
    await expect(topic.getByRole('img', { name: 'Премиум' })).toHaveCSS('color', 'rgb(242, 189, 90)');
    const boxes = await page.locator('.android-topic-list > button').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(); return { left: box.left, top: box.top, width: box.width, height: box.height };
    }));
    expect(new Set(boxes.map(box => box.left)).size).toBe(2);
    expect(boxes.every(box => box.width > box.height)).toBe(true);
    await expect(page.locator('.android-topics-page details')).toHaveCount(0);
    await mkdir('../artifacts/mobile-premium', { recursive: true });
    const prefix = `../artifacts/mobile-premium/${native ? 'native' : 'web'}-${width}`;
    await page.screenshot({ path: `${prefix}-topics.png` });
    await phrase.click();
    await expect(page.getByLabel('Новая фраза для повторения')).toBeVisible();
    await phrase.click();
    await expect(page.getByLabel('Новая фраза для повторения')).toHaveCount(0);
    await page.getByRole('button', { name: 'Статистика', exact: true }).click();
    const day = page.getByLabel('Ср 7: 20 попыток');
    await expect(day.locator('.calendar-day__star')).toBeVisible();
    await expect(day.locator('.calendar-day__star')).toHaveCSS('color', 'rgb(242, 189, 90)');
    const placement = await day.evaluate(element => {
      const cell = element.getBoundingClientRect(), star = element.querySelector('.calendar-day__star').getBoundingClientRect(), count = element.querySelector('.calendar-count').getBoundingClientRect();
      return { inside: star.bottom <= cell.bottom && star.left >= cell.left && star.right <= cell.right, below: star.top >= count.bottom };
    });
    expect(placement).toEqual({ inside: true, below: true });
    await page.screenshot({ path: `${prefix}-statistics.png` });
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    const version = page.getByLabel('Версия приложения');
    await expect(version).toHaveText('v.1.27');
    const alignment = await page.locator('.settings-heading').evaluate(element => {
      const row = element.getBoundingClientRect(), title = element.querySelector('h1').getBoundingClientRect(), version = element.querySelector('.settings-version').getBoundingClientRect();
      return { right: Math.abs(row.right - version.right), middle: Math.abs((title.top + title.bottom) / 2 - (version.top + version.bottom) / 2) };
    });
    expect(alignment.right).toBeLessThan(1);
    expect(alignment.middle).toBeLessThan(1);
    await page.screenshot({ path: `${prefix}-settings.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}
