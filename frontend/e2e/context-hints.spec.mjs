import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'android']) for (const alphabet of ['latin', 'cyrillic']) {
  test(`short nonliteral hints ${language} ${layout} ${alphabet}`, async ({ page }) => {
    const en = language === 'en';
    await page.setViewportSize(layout === 'desktop' ? { width: 1366, height: 900 } : { width: 360, height: 800 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await page.addInitScript(lang => {
      localStorage.setItem('serbotalk.interface-language', lang);
      localStorage.setItem('sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'hint-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, language);
    await page.addInitScript(value => localStorage.setItem('serbotalk.serbian-alphabet.hint-user', value), alphabet);
    const source = en ? 'I have nobody to talk to.' : 'Мне не с кем поговорить.';
    const fragment = en ? 'I have nobody' : 'Мне не с кем';
    const verb = en ? 'to talk to' : 'поговорить';
    const hints = [{ word_ru: fragment.toLowerCase(), translation_sr: 'nemam s kim' }, { word_ru: verb, translation_sr: 'da pričam' }];
    const saved = [];
    const topic = { id: 'custom-hints', title_ru: en ? 'Short hints' : 'Короткие подсказки', phrase_count: 1, is_custom: true };
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if ((path === '/api/auth/me' || path === '/api/auth/me/android-premium')) body = { id: 'hint-user', role: 'user', access_tier: 'premium', daily_usage: { used: 0, limit: 100, remaining: 100, resets_at: '2026-10-28T00:00:00Z' } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [topic];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', status: 'active', requested_length: 10, completed_count: 0, topic: { ...topic, source: 'preset' } }, exercise: { id: 'e1', source_ru: source, word_hints: hints, targeted_skills: [], expected_level: 'A2', difficulty: .5 } };
      else if (path.endsWith('/word-hints')) {
        const word = route.request().postDataJSON().word;
        saved.push(word);
        const hint = hints.find(h => h.word_ru === word.toLowerCase());
        expect(hint).toBeTruthy();
        body = { ...hint, is_learning: true };
      } else throw new Error(`Unexpected path ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/');
    const phrase = page.locator('.interactive-phrase:visible');
    await expect(phrase).toHaveAttribute('aria-label', source);
    await expect(phrase.getByRole('button')).toHaveCount(2);
    await expect(phrase.getByRole('button', { name: en ? 'I' : 'Мне', exact: true })).toHaveCount(0);
    const button = phrase.getByRole('button', { name: fragment, exact: true });
    await button.click();
    await expect(page.locator('.word-tooltip')).toHaveText(alphabet === 'latin' ? 'nemam s kim' : 'немам с ким');
    await expect(button).toHaveClass(/is-used/);
    await expect(phrase.getByRole('button', { name: verb, exact: true })).not.toHaveClass(/is-used/);
    await expect.poll(() => saved.length).toBe(1);
    const popup = await page.locator('.word-tooltip').boundingBox();
    expect(popup.x).toBeGreaterThanOrEqual(0);
    expect(popup.x + popup.width).toBeLessThanOrEqual(page.viewportSize().width);
    const colors = await button.evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
    expect(colors.color).not.toBe('rgb(0, 0, 0)');
    await mkdir('../artifacts/context-hints/screens', { recursive: true });
    await page.screenshot({ path: `../artifacts/context-hints/screens/${language}-${layout}-${alphabet}.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('.word-tooltip')).toHaveCount(0);
  });
}
