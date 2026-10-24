import { test, expect } from '@playwright/test';

for (const language of ['ru', 'en']) for (const native of [false, true]) for (const landing of [false, true]) {
  test(`email code ${language} ${native ? 'android-layout' : 'web'} ${landing ? 'landing' : 'app'}`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.addInitScript(({ language, native }) => {
      localStorage.setItem('serbotalk.interface-language', language);
      if (native) window.CapacitorCustomPlatform = { name: 'android' };
    }, { language, native });
    const en = language === 'en';
    let sends = 0, verifications = 0;
    await page.route('**/auth/v1/otp*', async route => {
      sends++;
      expect(route.request().postDataJSON().email).toBe('demo@example.invalid');
      await route.fulfill({ json: {} });
    });
    await page.route('**/auth/v1/verify*', async route => {
      verifications++;
      const body = route.request().postDataJSON();
      expect(body.type).toBe('email');
      if (body.token === '00000000') {
        await route.fulfill({ status: 403, json: { code: 'otp_expired', msg: 'private provider diagnostic' } });
        return;
      }
      expect(body.token).toBe('12345678');
      await route.fulfill({ json: { access_token: 'synthetic-local-only', refresh_token: 'synthetic-local-only', token_type: 'bearer', expires_in: 3600, user: { id: 'email-demo', aud: 'authenticated', role: 'authenticated', email: 'demo@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-24T00:00:00Z' } } });
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me') await route.fulfill({ json: { id: 'email-demo', email: 'demo@example.invalid', display_name: 'Demo', role: 'user', access_tier: 'free', daily_usage: { used: 0, limit: 20, remaining: 20, resets_at: '2026-10-25T00:00:00Z' } } });
      else if (path === '/api/topics') await route.fulfill({ json: [] });
      else if (path === '/api/review-phrases/summary') await route.fulfill({ json: { phrase_count: 0 } });
      else if (path === '/api/auth/me/preferences') await route.fulfill({ json: { assistance_enabled: false } });
      else await route.fulfill({ json: {} });
    });
    await page.goto(landing ? '/landing.html#sign-in' : '/app');
    await page.getByText(en ? 'Sign in with email' : 'Войти по email', { exact: true }).click();
    const form = page.getByRole('form', { name: en ? 'Sign in with an email code' : 'Вход по коду из письма' });
    await form.getByLabel('Email', { exact: true }).fill('demo@example.invalid');
    await form.getByRole('button', { name: en ? 'Get a code' : 'Получить код', exact: true }).click();
    const code = form.getByLabel(en ? 'Email code' : 'Код из письма', { exact: true });
    await expect(code).toBeVisible();
    await expect(form.getByRole('button', { name: en ? 'Resend code' : 'Отправить код ещё раз', exact: true })).toBeDisabled();
    await code.fill('00000000');
    await form.getByRole('button', { name: en ? 'Sign in' : 'Войти', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText(en ? 'invalid or has expired' : 'недействителен или истёк');
    await expect(form.getByRole('alert')).not.toContainText('private provider');
    await expect(code).toHaveValue('');
    const colors = await code.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    expect(colors.background).not.toBe('rgb(255, 255, 255)');
    expect(colors.color).not.toBe(colors.background);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../artifacts/email-otp/${language}-${native ? 'android-layout' : 'web'}-${landing ? 'landing' : 'app'}.png`, fullPage: true });
    await code.fill('12345678');
    await form.getByRole('button', { name: en ? 'Sign in' : 'Войти', exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('button', { name: en ? 'Settings' : 'Настройки', exact: true })).toBeVisible();
    expect(sends).toBe(1); expect(verifications).toBe(2);
    await page.reload();
    await expect(page.getByRole('button', { name: en ? 'Settings' : 'Настройки', exact: true })).toBeVisible();
    expect(sends).toBe(1);
  });
}
