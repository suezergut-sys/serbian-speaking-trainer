import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'android']) {
  test(`personal topic groups and compact Premium cards ${language} ${layout}`, async ({ page }) => {
    const ru = language === 'ru';
    await page.setViewportSize({ width: layout === 'desktop' ? 1366 : layout === 'mobile' ? 320 : 393, height: 844 });
    await page.addInitScript(({ language, layout, storageKey }) => {
      if (layout === 'android') window.CapacitorCustomPlatform = { name: 'android' };
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'synthetic-only', refresh_token: 'synthetic-only', expires_at: 4102444800, token_type: 'bearer', user: { id: 'premium-user', email: 'premium@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }));
    }, { language, layout, storageKey: process.env.LAYOUT_AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
    const topic = (id, title_ru, title_en, is_custom) => ({ id, title_ru, title_en, is_custom, description_ru: '', phrase_count: 2, custom_phrase_count: is_custom ? 2 : 0, likely_intents: [], suggested_vocabulary: [] });
    const topics = [topic('custom-z', 'Язык и повседневные разговоры', 'Animals and everyday conversations', true), topic('bank', 'В банке', null, false), topic('custom-a', 'Автомобиль', 'Travel', true), topic('doctor', 'Врач', null, false), topic('custom-m', 'Мои планы', 'My plans', true)];
    let phrases = topics.filter(item => item.is_custom).flatMap(item => [1, 2].map(index => ({ id: `${item.id}-${index}`, topic_id: item.id, source_ru: `Моя фраза ${index}: я хотел бы уточнить время встречи завтра.`, canonical_sr: 'Želim da proverim vreme.', best_score: 0, attempts: 0, perfect_streak: 0, status: 'active', created_at: '2026-10-26' })));
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'premium-user', role: 'user', access_tier: 'premium', email: 'premium@example.invalid', assistance_enabled: false, daily_usage: { used: 0, limit: 100, remaining: 100 } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = topics;
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', status: 'active', requested_length: 10, topic: { id: 'bank', title_ru: 'В банке', source: 'preset' } }, exercise: { id: 'e1', source_ru: 'Я хочу открыть счёт.', word_hints: [], targeted_skills: [] } };
      else if (path === '/api/custom-phrases') body = phrases;
      else if (path.startsWith('/api/custom-phrases/') && request.method() === 'DELETE') {
        phrases = phrases.filter(phrase => phrase.id !== path.split('/').at(-1));
        await route.fulfill({ status: 204 }); return;
      } else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    if (layout !== 'desktop') await page.getByRole('button', { name: ru ? 'Темы' : 'Topics', exact: true }).click();
    const home = page.locator(layout === 'desktop' ? '.desktop-topic-grid' : '.android-topic-list');
    const divider = home.getByRole('separator', { name: ru ? 'Личные темы' : 'Personal topics' });
    await expect(divider).toBeVisible();
    const expected = ru ? ['Автомобиль', 'Мои планы', 'Язык и повседневные разговоры'] : ['Animals and everyday conversations', 'My plans', 'Travel'];
    const names = home.locator(layout === 'desktop' ? '.topic--personal .topic__copy strong' : '.topic--personal > strong');
    await expect(names).toHaveText(expected);
    const grouping = await divider.evaluate(element => ({ before: element.previousElementSibling.classList.contains('topic--personal'), after: element.nextElementSibling.classList.contains('topic--personal'), cols: getComputedStyle(element.parentElement).gridTemplateColumns.split(' ').length }));
    expect(grouping).toEqual({ before: false, after: true, cols: 2 });
    const first = await home.locator('.topic--personal').nth(0).boundingBox(), second = await home.locator('.topic--personal').nth(1).boundingBox();
    expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    expect(second.x).toBeGreaterThan(first.x);
    const artifacts = '../artifacts/premium-topic-cards';
    await mkdir(artifacts, { recursive: true });
    await home.screenshot({ path: `${artifacts}/home-${language}-${layout}.png` });
    await page.getByRole('button', { name: ru ? 'Премиум' : 'Premium', exact: true }).click();
    const premium = page.locator('.premium-page');
    await expect(premium.locator('.premium-topic strong')).toHaveText(expected);
    await expect(premium.locator('.premium-catalog-grid')).toHaveCSS('grid-template-columns', /\d/);
    const card1 = await premium.locator('.premium-catalog-grid .custom-content-item').nth(0).boundingBox();
    const card2 = await premium.locator('.premium-catalog-grid .custom-content-item').nth(1).boundingBox();
    expect(Math.abs(card1.y - card2.y)).toBeLessThan(2);
    expect(card2.x).toBeGreaterThan(card1.x);
    const remove = await premium.locator('.premium-catalog-grid .custom-content-item').first().getByRole('button', { name: ru ? 'Удалить тему' : 'Delete topic', exact: true }).boundingBox();
    expect(remove.width).toBeLessThan(card1.width);
    await premium.locator('.premium-topic').first().click();
    await expect(premium.locator('.premium-phrase-grid .custom-content-item')).toHaveCount(2);
    await premium.screenshot({ path: `${artifacts}/premium-${language}-${layout}.png` });
    const overflow = await premium.evaluate(element => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(false);
    await premium.getByRole('button', { name: ru ? 'Удалить фразу' : 'Delete phrase', exact: true }).first().click();
    await premium.getByRole('button', { name: ru ? 'Подтвердить удаление' : 'Confirm deletion', exact: true }).click();
    await expect(premium.locator('.premium-phrase-grid .custom-content-item')).toHaveCount(1);
    await premium.getByRole('button', { name: ru ? 'Создать тему' : 'Create topic', exact: true }).click();
    const field = premium.getByRole('textbox', { name: ru ? 'Название темы' : 'Topic name', exact: true });
    await expect(field).toBeVisible();
    expect(await field.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    await expect(premium.getByRole('button', { name: ru ? 'Сохранить тему' : 'Save topic', exact: true })).toBeDisabled();
  });
}
