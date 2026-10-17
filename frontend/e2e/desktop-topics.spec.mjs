import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const titles = [['job-interview', 'Собеседование'], ['bank', 'В банке'], ['vacation', 'В отпуске'], ['cafe', 'В кафе'], ['work', 'На работе'], ['doctor', 'У врача'], ['rent', 'Аренда'], ['transport', 'Транспорт'], ['misc', 'Разное']];
for (const language of ['ru', 'en']) for (const width of [800, 1024, 1366, 1920]) {
  test(`desktop topic cards ${language} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ language, storageKey }) => {
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'cards-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, { language, storageKey: process.env.LAYOUT_AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'cards-user', email: 'learner@example.invalid', role: 'user', access_tier: 'free', daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: '2026-10-15T00:00:00Z' } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = titles.map(([id, title_ru]) => ({ id, title_ru, description_ru: '', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] }));
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', status: 'active', requested_length: 10, completed_count: 0, topic: { id: 'bank', title_ru: 'В банке', source: 'preset' } }, exercise: { id: 'e1', source_ru: 'Я хочу открыть новый текущий счёт.', word_hints: [], targeted_skills: [], expected_level: 'A2', difficulty: 1 } };
      else throw new Error(`Unexpected API: ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    const cards = page.locator('.desktop-topic-grid > button');
    await expect(cards).toHaveCount(12);
    const topicsPanel = await page.locator('.workspace > .topics-panel').boundingBox();
    const practicePanel = await page.locator('.workspace > .practice-stage').boundingBox();
    expect(Math.abs(practicePanel.width - topicsPanel.width * 2)).toBeLessThan(1);
    expect(practicePanel.x).toBeGreaterThan(topicsPanel.x + topicsPanel.width);
    expect(await page.locator('.workspace').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1020);
    expect(await page.locator('.workspace').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const boxes = await cards.evaluateAll(elements => elements.map(element => { const b = element.getBoundingClientRect(); return { left: b.left, width: b.width, height: b.height, scroll: element.scrollWidth, client: element.clientWidth }; }));
    expect(new Set(boxes.map(box => box.left)).size).toBe(2);
    expect(boxes.every(box => box.width > box.height && box.scroll <= box.client)).toBe(true);
    const premium = page.locator('.desktop-topic-card--premium');
    for (const button of await premium.all()) {
      await expect(button).toBeDisabled();
      await expect(button.getByRole('img', { name: language === 'en' ? 'Premium' : 'Премиум' })).toHaveCSS('color', 'rgb(242, 189, 90)');
      await expect(button.locator('strong')).toHaveCSS('white-space', 'normal');
    }
    await expect(page.locator('.topic-action')).toHaveCount(0);
    await mkdir('../artifacts/desktop-topics', { recursive: true });
    await page.screenshot({ path: `../artifacts/desktop-topics/${language}-${width}.png` });
    await page.getByRole('button', { name: language === 'en' ? /At the bank/ : /В банке/ }).click();
    await expect(page.locator('.topic.is-selected')).toHaveCount(1);
  });
}
