import { expect, test } from '@playwright/test';

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'android']) {
  test(`share settings ${language} ${layout}`, async ({ page }) => {
    const en = language === 'en';
    await page.setViewportSize({ width: layout === 'desktop' ? 1366 : 320, height: 852 });
    await page.addInitScript(({ language, native, storageKey }) => {
      if (native) window.CapacitorCustomPlatform = { name: 'android' };
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800,
        user: { id: 'share-test', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
      window.shareTest = { mode: 'pending', calls: [], copied: [] };
      Object.defineProperty(navigator, 'share', { configurable: true, value: data => {
        window.shareTest.calls.push(data);
        if (window.shareTest.mode === 'cancel') return Promise.reject(new DOMException('Dismissed', 'AbortError'));
        if (window.shareTest.mode === 'error') return Promise.reject(new Error('Synthetic failure'));
        return new Promise(resolve => { window.shareTest.finish = resolve; });
      } });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => {
        if (window.shareTest.mode === 'copy-error') throw new Error('Denied');
        window.shareTest.copied.push(text);
      } } });
    }, { language, native: layout === 'android', storageKey: process.env.LAYOUT_AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'share-test', email: 'learner@example.invalid', display_name: 'Learner', role: 'user', access_tier: 'free', can_debug_models: false, daily_usage: { used: 0, limit: 20, remaining: 20, resets_at: '2026-10-23T00:00:00Z' } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    await page.getByRole('button', { name: en ? 'Settings' : 'Настройки', exact: true }).click();
    const panel = page.getByRole('region', { name: en ? 'Share app' : 'Поделиться приложением', exact: true });
    await panel.scrollIntoViewIfNeeded();
    const share = panel.getByRole('button', { name: en ? 'Share' : 'Поделиться', exact: true });
    const copy = panel.getByRole('button', { name: en ? 'Copy link' : 'Скопировать ссылку' });
    await expect(share).toHaveCSS('color', 'rgb(234, 242, 255)');
    await expect(panel.locator('input')).toHaveValue('https://serbotalk.app/');
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await share.click();
    await expect(share).toBeDisabled(); await expect(copy).toBeDisabled();
    await expect(panel.getByRole('status')).toHaveText(en ? 'Opening share menu…' : 'Открываем меню отправки…');
    await expect(share).toHaveCSS('color', 'rgb(136, 166, 210)');
    await page.evaluate(() => window.shareTest.finish());
    await expect(share).toBeEnabled();
    expect(await page.evaluate(() => window.shareTest.calls)).toEqual([{ title: 'SerboTalk', text: en ? 'Practise speaking Serbian with SerboTalk.' : 'Практикуйте разговорный сербский с SerboTalk.', url: 'https://serbotalk.app/' }]);
    await page.evaluate(() => { window.shareTest.mode = 'cancel'; });
    await share.click(); await expect(share).toBeEnabled();
    await expect(panel.getByRole('alert')).toHaveCount(0);
    await page.evaluate(() => { window.shareTest.mode = 'error'; });
    await share.click(); await expect(panel.getByRole('alert')).toBeVisible();
    await expect(panel.getByRole('alert')).toHaveCSS('color', 'rgb(255, 158, 170)');
    await panel.screenshot({ path: `test-results/share-${language}-${layout}-error.png` });
    await copy.click();
    await expect(panel.getByRole('status')).toHaveText(en ? 'Link copied.' : 'Ссылка скопирована.');
    expect(await page.evaluate(() => window.shareTest.copied)).toEqual(['https://serbotalk.app/']);
    await page.evaluate(() => { window.shareTest.mode = 'copy-error'; });
    await copy.click(); await expect(panel.getByRole('alert')).toBeVisible();
    await panel.locator('input').focus();
    expect(await panel.locator('input').evaluate(el => el.selectionEnd - el.selectionStart)).toBe('https://serbotalk.app/'.length);
    await page.evaluate(() => { window.shareTest.mode = 'ok'; Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
    await share.click(); await expect(panel.getByRole('status')).toHaveText(en ? 'Link copied.' : 'Ссылка скопирована.');
    await panel.screenshot({ path: `test-results/share-${language}-${layout}-copied.png` });
  });
}
