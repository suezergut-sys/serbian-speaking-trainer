import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.use({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });

for (const language of ['ru', 'en']) {
  test(`current Android store screens and legal pages ${language}`, async ({ page }) => {
    const ru = language === 'ru';
    await page.addInitScript(({ language }) => {
      window.CapacitorCustomPlatform = { name: 'android' };
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem('serbotalk.serbian-alphabet.store-demo', 'latin');
      localStorage.setItem('sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'synthetic-only', refresh_token: 'synthetic-only', expires_at: 4102444800, token_type: 'bearer', user: { id: 'store-demo', email: 'demo@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }));
    }, { language });
    const titles = [['bank', 'В банке'], ['cafe', 'В кафе'], ['transport', 'В транспорте'], ['doctor', 'У врача'], ['rent', 'Аренда жилья'], ['work', 'На работе'], ['vacation', 'В отпуске'], ['job-interview', 'Собеседование']];
    const topics = titles.map(([id, title_ru]) => ({ id, title_ru, description_ru: '', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] }));
    topics.push({ id: 'personal-demo', title_ru: 'Мои разговоры', title_en: 'My conversations', description_ru: '', phrase_count: 1, is_custom: true, custom_phrase_count: 1 });
    let claims = 0;
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let body;
      if (path === '/api/auth/me/android-premium') {
        expect(request.method()).toBe('POST');
        expect(request.postDataJSON()).toEqual({ platform: 'android' });
        claims++;
        body = { id: 'store-demo', email: 'demo@example.invalid', display_name: ru ? 'Демонстрация' : 'Demo', role: 'user', access_tier: 'premium', assistance_enabled: true, daily_usage: { used: 0, limit: 100, remaining: 100 } };
      } else if (path === '/api/topics') body = topics;
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: true };
      else if (path === '/api/exercises/e1/word-hints') body = { word_ru: request.postDataJSON().word, translation_sr: 'želim', is_learning: true };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', status: 'active', requested_length: 20, completed_count: 0, topic: { ...topics[0], source: 'preset' } }, exercise: { id: 'e1', source_ru: ru ? 'Я хочу открыть счёт.' : 'I want to open an account.', source_en: 'I want to open an account.', source_hints: [{ word_ru: ru ? 'хочу' : 'want', translation_sr: 'želim' }], word_hints: [{ word_ru: 'хочу', translation_sr: 'želim' }], targeted_skills: [] } };
      else if (path === '/api/custom-phrases') body = [{ id: 'phrase-demo', source_ru: 'Я скоро вернусь.', canonical_sr: 'Uskoro ću se vratiti.', topic_id: 'personal-demo', status: 'active' }];
      else throw new Error(`Unexpected store screenshot API ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const folder = '../artifacts/android-1.43-store';
    await mkdir(folder, { recursive: true });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    const nav = page.locator('.android-header nav');
    await expect(nav).toBeVisible();
    expect(claims).toBeGreaterThan(0);
    await nav.getByRole('button', { name: ru ? 'Темы' : 'Topics', exact: true }).click();
    await expect(page.getByRole('button', { name: /Мои разговоры|My conversations/ })).toBeVisible();
    await page.screenshot({ path: `${folder}/${language}-01-topics.png` });
    await page.getByRole('button', { name: /В банке|At the bank/ }).click();
    await expect(page.locator('.interactive-phrase:visible')).toBeVisible();
    await page.getByRole('button', { name: ru ? 'хочу' : 'want', exact: true }).click();
    await expect(page.getByText('želim', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${folder}/${language}-02-practice.png` });
    await nav.getByRole('button', { name: ru ? 'Премиум' : 'Premium', exact: true }).click();
    await expect(page.getByRole('button', { name: ru ? 'Создать тему' : 'Create topic', exact: true })).toBeVisible();
    await expect(page.locator('.premium-page')).not.toContainText(/оплат|купить|payment|buy/i);
    await expect(page.getByText(/Загружаем свои фразы|Loading your phrases/)).toHaveCount(0);
    await page.screenshot({ path: `${folder}/${language}-03-premium.png` });
    await nav.getByRole('button', { name: ru ? 'Настройки' : 'Settings', exact: true }).click();
    await expect(page.locator('.settings-version')).toHaveText('v.1.43');
    await page.screenshot({ path: `${folder}/${language}-04-settings.png` });
    for (const kind of ['privacy', 'terms', 'delete-account']) {
      await page.goto(`/${kind}`);
      await expect(page.locator('.legal-updated')).toContainText(ru ? '30 октября 2026' : '30 October 2026');
      expect(await page.locator('.legal-card').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (kind === 'terms') await expect(page.locator('.legal-card')).toContainText(ru ? 'до 100 тренировок' : 'up to 100 exercises');
      if (kind === 'delete-account') await expect(page.locator('a[href^="mailto:"]')).toHaveCount(2);
      await page.screenshot({ path: `${folder}/${language}-${kind}.png` });
    }
  });
}
