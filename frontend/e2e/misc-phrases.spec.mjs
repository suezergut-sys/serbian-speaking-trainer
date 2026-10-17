import { expect, test } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const phrases = JSON.parse(readFileSync(new URL('../src/locales/phrases.en.json', import.meta.url), 'utf8'));
for (const language of ['ru', 'en']) for (const layout of ['web', 'android']) {
  test(`misc phrase and context hints ${language} ${layout}`, async ({ page }) => {
    const phrase = phrases.find(p => p.id === 'misc-25');
    const en = language === 'en';
    await page.setViewportSize({ width: layout === 'web' ? 320 : 393, height: 851 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await page.addInitScript(({ language, storageKey }) => {
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'misc-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, { language, storageKey: process.env.PRACTICE_AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
    const topic = { id: 'misc', title_ru: 'Разное', description_ru: 'Повседневные разговоры, короткие диалоги и разговорные выражения.', phrase_count: 50, is_custom: false, likely_intents: [], suggested_vocabulary: [] };
    const hints = en ? Object.entries(phrase.word_hints).map(([word_ru, hint]) => ({ word_ru, translation_sr: hint.translation_sr })) : [{ word_ru: 'Ладно', translation_sr: 'Ajde' }];
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'misc-user', role: 'user', access_tier: 'free', email: 'learner@example.invalid', daily_usage: { used: 0, limit: 20, remaining: 20 } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [topic];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 1 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', topic: { ...topic, source: 'preset' }, status: 'active', requested_length: 50, completed_count: 0 }, exercise: { id: 'e1', session_id: 's1', source_ru: phrase.source_ru, word_hints: hints, targeted_skills: [], expected_level: 'A2', difficulty: 1 } };
      else if (path.endsWith('/word-hints')) body = { word_ru: route.request().postDataJSON().word, translation_sr: 'Ajde', learning_status: 'learning', correct_streak: 0 };
      else throw new Error(`Unexpected fixture path ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/');
    const stage = page.locator('.exercise-layout:visible');
    await expect(stage.locator('.exercise-topic')).toHaveText(en ? 'Miscellaneous' : 'Разное');
    const source = stage.locator('.interactive-phrase');
    await expect(source).toHaveText(en ? phrase.source_en : phrase.source_ru);
    await source.getByRole('button', { name: en ? 'All' : 'Ладно', exact: true }).click();
    await expect(page.locator('.word-tooltip')).toContainText('Ajde', { ignoreCase: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    mkdirSync('../artifacts/misc-phrases', { recursive: true });
    await page.screenshot({ path: `../artifacts/misc-phrases/${language}-${layout}.png` });
  });
}
