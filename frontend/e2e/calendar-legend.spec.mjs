import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'compact-desktop', 'mobile', 'android']) {
  test(`calendar legend matches day colors ${language} ${layout}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
    await page.setViewportSize({ width: layout === 'desktop' ? 1366 : layout === 'compact-desktop' ? 800 : 393, height: 900 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await page.addInitScript(({ language, storageKey }) => {
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'calendar-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, { language, storageKey: process.env.PRACTICE_AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let body;
      if (url.pathname === '/api/auth/me') body = { id: 'calendar-user', email: 'learner@example.invalid', display_name: 'Learner', role: 'user', access_tier: 'free', daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: '2026-10-08T00:00:00Z' } };
      else if (url.pathname === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (url.pathname === '/api/topics') body = [];
      else if (url.pathname === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (url.pathname === '/api/statistics/monthly') body = {
        month: url.searchParams.get('month'), active_days: 3, total_phrases: 3, total_translations: 31, correct_translations: 0, mastered_phrases: 0,
        days: [1, 10, 20].map((count, index) => ({ date: `2026-10-0${5 + index}`, phrase_count: 1, translation_count: count, correct_translation_count: 0, mastered_phrase_count: 0 })),
      };
      else if (url.pathname === '/api/statistics/phrase-topics') body = [{ topic_id: 'bank', topic_title: 'В банке', phrase_count: 45 }];
      else if (url.pathname === '/api/statistics/phrases') body = { total: 45, page: Number(url.searchParams.get('page')), page_size: url.searchParams.get('page_size'), total_pages: url.searchParams.get('page_size') === '50' ? 1 : 3, groups: [{ topic_id: 'bank', topic_title: 'В банке', phrases: [{ id: 'phrase', source_ru: 'Я хочу открыть счёт.', target_sr: 'Želim da otvorim račun.', attempts: 20, status: 'learning', difficulty: null, next_review_at: null }] }] };
      else throw new Error(`Unexpected fixture route ${url.pathname}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    const practiceWidth = layout.includes('desktop') ? (await page.locator('.practice-stage').boundingBox()).width : null;
    await page.getByRole('button', { name: language === 'en' ? 'Statistics' : 'Статистика', exact: true }).click();
    await expect(page.locator('.calendar-day')).toHaveCount(7);
    if (practiceWidth !== null) expect(Math.abs((await page.locator('.statistics-page').boundingBox()).width - practiceWidth)).toBeLessThan(1);
    await expect(page.locator('.calendar-day__star')).toHaveCSS('width', '18px');
    await expect(page.locator('.calendar-legend .gold-star')).toHaveCSS('width', '18px');
    await mkdir('../artifacts/statistics-layout', { recursive: true });
    await page.screenshot({ path: `../artifacts/statistics-layout/${language}-${layout}.png` });
    const palette = element => {
      const style = getComputedStyle(element);
      return { background: style.background, border: style.border, shadow: style.boxShadow };
    };
    const markers = page.locator('.calendar-legend i');
    await expect(markers).toHaveCount(2);
    for (const [index, day] of [0, 1].entries()) {
      const marker = markers.nth(index);
      await expect(marker).toBeVisible();
      expect(await marker.evaluate(palette)).toEqual(await page.locator('.calendar-day').nth(day).evaluate(palette));
    }
    await expect(page.locator('.calendar-day').nth(2).locator('.calendar-day__star')).toBeVisible();
    expect(await page.locator('.calendar-legend .gold-star').evaluate(el => getComputedStyle(el).color))
      .toBe(await page.locator('.calendar-day__star').evaluate(el => getComputedStyle(el).color));
    await expect(page.locator('.calendar-day').nth(3)).not.toHaveClass(/is-active/);
    expect(await page.locator('.statistics-page').evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: language === 'en' ? 'Phrases by topic →' : 'Фразы по темам →' }).click();
    const size = page.getByRole('combobox', { name: language === 'en' ? 'Per page' : 'На странице' });
    await expect(size).toHaveValue('20');
    await expect(size.locator('option')).toHaveText(['20', '50']);
    await expect(size).toHaveCSS('background-color', 'rgb(7, 27, 52)');
    await page.getByRole('button', { name: language === 'en' ? 'Next' : 'Вперёд' }).click();
    await expect(size).toBeVisible();
    await size.selectOption('50');
    await expect(size).toHaveValue('50');
    await expect(page.getByRole('button', { name: language === 'en' ? 'Next' : 'Вперёд' })).toBeDisabled();
    expect(await page.locator('.statistics-page').evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}
