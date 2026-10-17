import { test, expect } from '@playwright/test';

for (const language of ['ru', 'en']) for (const native of [false, true]) {
  test(`embedded login → trainer ${language} ${native ? 'android-layout' : 'web'}`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.addInitScript(({ language, native }) => {
      localStorage.setItem('serbotalk.interface-language', language);
      if (native) window.CapacitorCustomPlatform = { name: 'android' };
    }, { language, native });
    const en = language === 'en';
    let signInRequests = 0;
    await page.route('**/auth/v1/token?grant_type=password', async route => {
      signInRequests++;
      await route.fulfill({ json: { access_token: 'synthetic-local-only', refresh_token: 'synthetic-local-only', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: 'landing-demo', aud: 'authenticated', role: 'authenticated', email: 'demo@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } } });
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const daily_usage = { used: 0, limit: 20, remaining: 20, resets_at: '2026-10-18T00:00:00Z' };
      if (path === '/api/auth/me') await route.fulfill({ json: { id: 'landing-demo', display_name: 'Demo', role: 'user', access_tier: 'free', daily_usage } });
      else if (path === '/api/topics') await route.fulfill({ json: [{ id: 'cafe', title_ru: 'В кафе', phrase_count: 20, is_custom: false }] });
      else if (path === '/api/auth/me/preferences') await route.fulfill({ json: { assistance_enabled: false } });
      else if (path === '/api/review-phrases/summary') await route.fulfill({ json: { phrase_count: 0 } });
      else if (path === '/api/sessions/start') await route.fulfill({ json: { session: { id: 's1', status: 'active', requested_length: 10, completed_count: 0, topic: { id: 'cafe', title_ru: 'В кафе', source: 'preset' } }, exercise: { id: 'e1', session_id: 's1', source_ru: 'Можно мне, пожалуйста, меню?', word_hints: [], targeted_skills: [], expected_level: 'A2', difficulty: 1 } } });
      else throw new Error(`Unexpected API ${path}`);
    });
    await page.goto('/landing.html');
    await page.getByRole('link', { name: en ? /Start speaking/ : /Начать говорить/ }).click();
    const login = page.getByRole('region', { name: en ? 'Welcome to SerboTalk' : 'Добро пожаловать в SerboTalk' });
    await expect(login).toBeInViewport();
    await login.locator('summary').click();
    await login.getByLabel(en ? 'Username or email' : 'Имя пользователя или email').fill('demo@example.invalid');
    await login.getByLabel(en ? 'Password' : 'Пароль', { exact: true }).fill('synthetic-local-only');
    await login.getByRole('button', { name: en ? 'Sign in' : 'Войти', exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.interactive-phrase').filter({ visible: true })).toBeVisible();
    expect(signInRequests).toBe(1);
    await page.reload();
    await expect(page.locator('.interactive-phrase').filter({ visible: true })).toBeVisible();
    await page.goto('/landing.html#sign-in');
    await expect(page.getByRole('link', { name: en ? /Continue practising/ : /Продолжить тренировку/ })).toBeVisible();
    await expect(page).toHaveURL(/landing\.html#sign-in$/);
  });
}
