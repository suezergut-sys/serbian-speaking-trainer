import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const language of ['ru', 'en']) for (const native of [false, true]) {
  test(`review password access ${language} ${native ? 'android' : 'web'}`, async ({ page }) => {
    const ru = language === 'ru';
    await page.setViewportSize({ width: native ? 393 : 1366, height: 900 });
    await page.addInitScript(({ language, native }) => {
      localStorage.setItem('serbotalk.interface-language', language);
      if (native) window.CapacitorCustomPlatform = { name: 'android' };
    }, { language, native });
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'review@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
    const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ ...user, sub: user.id, exp: 4102444800 })).toString('base64url'), 'synthetic-signature'].join('.');
    let signIns = 0, claims = 0;
    await page.route('**/auth/v1/**', async route => {
      expect(new URL(route.request().url()).pathname).toBe('/auth/v1/user');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    });
    await page.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      let body, status = 200;
      if (path === '/api/auth/review-login') {
        expect(req.postDataJSON()).toEqual({ username: 'serbotalkreview', password: 'synthetic-password' });
        signIns++;
        if (signIns === 1) { status = 401; body = { detail: 'private-provider-details' }; }
        else body = { access_token: token, refresh_token: 'synthetic-refresh' };
      } else {
        expect(req.headers().authorization).toBe(`Bearer ${token}`);
        if (path === '/api/auth/me' || path === '/api/auth/me/android-premium') {
          if (path.endsWith('/android-premium')) { claims++; expect(req.postDataJSON()).toEqual({ platform: 'android' }); }
          body = { ...user, role: 'user', access_tier: 'premium', assistance_enabled: false, daily_usage: { used: 0, limit: 100, remaining: 100 } };
        } else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
        else if (path === '/api/topics') body = [{ id: 'bank', title_ru: 'В банке', title_en: 'At the bank', phrase_count: 20 }];
        else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
        else if (path === '/api/custom-phrases') body = [];
        else if (path === '/api/sessions/start') body = {
          session: { id: 'synthetic-session', topic: { id: 'bank', title_ru: 'В банке', source: 'preset' }, requested_length: 10 },
          exercise: { id: 'synthetic-exercise', source_ru: 'Я хочу открыть счёт.', source_versions: { ru: 'Я хочу открыть счёт.', en: 'I want to open an account.', hints_ru: [], hints_en: [] }, targeted_skills: [] },
        };
        else throw new Error(`Unexpected path ${path}`);
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    await page.getByText(ru ? 'Вход для проверки' : 'Review access', { exact: true }).click();
    const username = page.getByLabel(ru ? 'Имя пользователя или email' : 'Username or email');
    const password = page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true });
    await username.fill('serbotalkreview');
    await password.fill('synthetic-password');
    await page.getByRole('button', { name: ru ? 'Войти' : 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).not.toContainText('private-provider-details');
    await expect(password).toHaveValue('');
    await expect(username).toHaveValue('serbotalkreview');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('../artifacts/android-1.45-review', { recursive: true });
    await page.screenshot({ path: `../artifacts/android-1.45-review/${language}-${native ? 'android' : 'web'}-error.png` });
    await password.fill('synthetic-password');
    await page.getByRole('button', { name: ru ? 'Войти' : 'Sign in', exact: true }).click();
    const nav = page.locator(native ? '.android-header nav' : '.main-nav');
    await nav.getByRole('button', { name: ru ? 'Премиум' : 'Premium', exact: true }).click();
    await expect(page.getByRole('button', { name: ru ? 'Создать тему' : 'Create topic', exact: true })).toBeVisible();
    await expect(page.locator('.premium-offer, .payment-form')).toHaveCount(0);
    expect(signIns).toBe(2);
    expect(claims).toBe(native ? 1 : 0);
    await page.screenshot({ path: `../artifacts/android-1.45-review/${language}-${native ? 'android' : 'web'}-premium.png` });
  });
}
