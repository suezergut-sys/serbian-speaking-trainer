import { expect, test } from '@playwright/test';

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'android']) {
  test(`free daily allowance ${language} ${layout}`, async ({ page }) => {
    const en = language === 'en';
    await page.setViewportSize({ width: layout === 'desktop' ? 1366 : 393, height: 852 });
    await page.addInitScript(({ language, layout, storageKey }) => {
      if (layout === 'android') window.CapacitorCustomPlatform = { name: 'android' };
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'synthetic-only', refresh_token: 'synthetic-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'free-user', aud: 'authenticated', role: 'authenticated', email: 'free@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-16T00:00:00Z' } }));
    }, { language, layout, storageKey: process.env.RESULT_AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'free-user', email: 'free@example.invalid', display_name: 'Free learner', role: 'user', access_tier: 'free', daily_usage: { used: 3, limit: 20, remaining: 17, resets_at: '2026-10-17T00:00:00Z' } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else throw new Error(`Unexpected fixture API: ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/terms');
    await expect(page.getByText(en ? /Free accounts can complete up to 20 phrases per day/ : /Бесплатный аккаунт может выполнить до 20 фраз в сутки/)).toBeVisible();
    await expect(page.getByText(/до 10 фраз в сутки|up to 10 phrases per day/)).toHaveCount(0);
    await page.goto('/');
    await page.getByRole('button', { name: en ? 'Settings' : 'Настройки', exact: true }).click();
    const usage = page.getByText(en ? '17 of 20 phrases remaining' : '17 из 20 фраз осталось', { exact: true });
    await expect(usage).toBeVisible();
    await usage.scrollIntoViewIfNeeded();
    await expect(usage).toBeInViewport({ ratio: 1 });
  });
}
