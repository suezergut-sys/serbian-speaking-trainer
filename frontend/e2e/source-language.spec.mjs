import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const layout of ['web', 'android']) for (const language of ['ru', 'en']) for (const personal of [false, true]) {
  test(`source language ${layout} ${language} personal=${personal}`, async ({ page }) => {
    await page.setViewportSize({ width: layout === 'android' ? 393 : 1366, height: 900 });
    await page.addInitScript(({ layout, language }) => {
      if (layout === 'android') window.CapacitorCustomPlatform = { name: 'android' };
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem('sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'synthetic-only', refresh_token: 'synthetic-only', expires_at: 4102444800, token_type: 'bearer', user: { id: 'source-demo', email: 'demo@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }));
    }, { layout, language });
    const versions = { ru: 'Я живу рядом с парком.', en: 'I live near the park.', hints_ru: [{ word_ru: 'парком', translation_sr: 'parka' }], hints_en: [{ word_ru: 'park', translation_sr: 'parka' }] };
    const topic = { id: personal ? 'custom-language' : 'bank', title_ru: personal ? 'Личная тема' : 'В банке', title_en: personal ? 'Personal topic' : 'At the bank', is_custom: personal, phrase_count: 1, likely_intents: [], suggested_vocabulary: [] };
    let starts = 0;
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let body;
      if (path === '/api/auth/me' || path === '/api/auth/me/android-premium') body = { id: 'source-demo', role: 'user', access_tier: 'premium', daily_usage: { used: 0, limit: 100 } };
      else if (path === '/api/topics') body = [topic];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: true };
      else if (path === '/api/sessions/start') {
        starts++;
        expect(request.headers()['x-interface-language']).toBe(language);
        body = { session: { id: 's1', status: 'active', requested_length: 10, completed_count: 0, topic: { ...topic, source: personal ? 'custom' : 'preset' } }, exercise: { id: 'e1', session_id: 's1', source_ru: versions.ru, source_en: versions.en, source_versions: versions, source_text: versions[language], source_language: language, targeted_skills: [], difficulty: .5 } };
      } else if (path.endsWith('/word-hints')) body = { word_ru: request.postDataJSON().word, translation_sr: 'parka', is_learning: true };
      else throw new Error('Unexpected request: ' + path);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/');
    const phrase = page.locator('.interactive-phrase:visible');
    await expect(phrase).toHaveAttribute('aria-label', versions[language]);
    await expect(phrase.getByRole('button', { name: language === 'en' ? 'park' : 'парком', exact: true })).toBeVisible();
    const other = language === 'en' ? 'ru' : 'en';
    const nav = layout === 'android' ? page.locator('.android-header nav') : page.locator('.main-nav');
    await nav.getByRole('button', { name: language === 'en' ? 'Settings' : 'Настройки', exact: true }).click();
    await page.getByRole('radio', { name: other === 'en' ? 'English' : 'Русский', exact: true }).click();
    await nav.getByRole('button', { name: other === 'en' ? 'Practice' : layout === 'android' ? 'Тренировка' : 'Практика', exact: true }).click();
    await expect(phrase).toHaveAttribute('aria-label', versions[other]);
    await expect(phrase.getByRole('button', { name: other === 'en' ? 'park' : 'парком', exact: true })).toBeVisible();
    expect(starts).toBe(1); // Same response remains safe after switching locale.
    expect(await phrase.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await mkdir('../artifacts/source-language/screens', { recursive: true });
    await page.screenshot({ path: `../artifacts/source-language/screens/${layout}-${language}-${personal}.png` });
  });
}
