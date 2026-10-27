import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
const catalog = JSON.parse(readFileSync(new URL('../src/locales/phrases.en.json', import.meta.url), 'utf8'));
for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'android']) {
  test(`independent word hints ${language} ${layout}`, async ({ page }) => {
    const en = language === 'en';
    await page.setViewportSize(layout === 'desktop' ? { width: 1366, height: 900 } : { width: 393, height: 851 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await page.addInitScript(lang => {
      localStorage.setItem('serbotalk.interface-language', lang);
      localStorage.setItem('sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'hint-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, language);
    const topic = { id: 'vacation', title_ru: 'Отпуск', phrase_count: 20, is_custom: false };
    let current = catalog.find(item => item.id === 'vacation-10');
    const saved = [];
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'hint-user', role: 'user', access_tier: 'free', daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: '2026-10-15T00:00:00Z' } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [topic];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', status: 'active', requested_length: 10, completed_count: 0, topic: { ...topic, source: 'preset' } }, exercise: { id: 'e1', source_ru: current.source_ru, word_hints: [{ word_ru: 'когда', translation_sr: 'Kada' }, { word_ru: 'лучше', translation_sr: 'najbolje' }, { word_ru: 'покупать', translation_sr: 'kupiti' }], targeted_skills: [], expected_level: 'A2', difficulty: 1 } };
      else if (path.endsWith('/word-hints')) {
        const word = route.request().postDataJSON().word;
        saved.push(word);
        const translations = en ? current.word_hints : { 'Когда': { translation_sr: 'Kada' }, 'лучше': { translation_sr: 'najbolje' }, 'покупать': { translation_sr: 'kupiti' } };
        const hint = translations[word.toLowerCase()] ?? translations[word];
        if (!hint) throw new Error(`Unknown source word ${word}`);
        body = { word_ru: word, translation_sr: hint.translation_sr, is_learning: true };
      } else throw new Error(`Unexpected path ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/');
    const phrase = page.locator('.interactive-phrase:visible');
    await expect(phrase).toHaveAttribute('aria-label', en ? current.source_en : current.source_ru);
    if (en) {
      expect((await phrase.getByRole('button').allTextContents()).map(s => s.toLowerCase()).sort()).toEqual(Object.keys(current.word_hints).sort());
      await expect(phrase.getByRole('button', { name: 'the', exact: true })).toHaveCount(0);
      await expect(phrase.getByRole('button', { name: 'time', exact: true })).toHaveCount(0);
      await phrase.getByRole('button', { name: 'is', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: /^je$/ })).toBeVisible();
    }
    for (const [word, translation] of en ? [['best', 'najbolje'], ['cheap', 'jeftine'], ['to buy', 'kupiti']] : [['Когда', 'Kada'], ['лучше', 'najbolje'], ['покупать', 'kupiti']]) {
      await phrase.getByRole('button', { name: word, exact: true }).click();
      await expect(page.locator('.word-tooltip')).toContainText(translation);
      await expect(phrase.getByRole('button', { name: word, exact: true })).toHaveClass(/is-used/);
    }
    await expect.poll(() => saved.length).toBe(en ? 4 : 3);
    expect(saved).toEqual(en ? ['is', 'best', 'cheap', 'to buy'] : ['Когда', 'лучше', 'покупать']);
    await mkdir('../artifacts/english-hints', { recursive: true });
    await page.screenshot({ path: `../artifacts/english-hints/${language}-${layout}.png` });
    if (en) {
      current = catalog.find(item => item.id === 'job-interview-05');
      await page.reload();
      await expect(phrase).toHaveAttribute('aria-label', current.source_en);
      for (const word of ['What', 'duties', 'new', 'employee', 'have']) await expect(phrase.getByRole('button', { name: word, exact: true })).toBeVisible();
      await phrase.getByRole('button', { name: 'have', exact: true }).click();
      await expect(page.locator('.word-tooltip')).toHaveText('imati');
    }
  });
}
